const bookingRepository = require('../repositories/bookingRepository');
const cafeRepository = require('../repositories/cafeRepository');
const bookingUtils = require('../utils/bookingUtils');
const notificationService = require('./notificationService');
const paymentService = require('./paymentService');

const createBooking = async (userId, data) => {
  const {
    cafe_id,
    package_id,
    event_service_id,
    booking_date,
    start_time,
    end_time,
    hours,
    total_persons,
    food_amount = 0,
    decoration_amount = 0,
    extra_person_amount = 0,
    discount = 0,
    special_request,
  } = data;

  // 1. Validate Cafe & Bank Verification
  const cafe = await cafeRepository.findCafeById(cafe_id);
  if (!cafe) {
    const error = new Error('Cafe not found');
    error.statusCode = 404;
    throw error;
  }

  if (String(cafe.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
    const error = new Error('This cafe cannot accept bookings until their bank details are verified.');
    error.statusCode = 400;
    throw error;
  }

  // 1b. Check if Cafe is open on the requested date
  if (bookingUtils.isCafeClosedOnDate(cafe, booking_date)) {
    const dayName = bookingUtils.getDayNameOfDate(booking_date);
    const dayFormatted = dayName ? (dayName.charAt(0) + dayName.slice(1).toLowerCase()) : 'the selected day';
    const error = new Error(`The cafe is closed on ${dayFormatted}s and cannot accept bookings for this date.`);
    error.statusCode = 400;
    throw error;
  }

  // 1c. Enforce 24-hour advance booking policy
  if (bookingUtils.isBookingWithin24Hours(booking_date, start_time)) {
    const error = new Error('Bookings must be made at least 24 hours in advance of the scheduled booking time.');
    error.statusCode = 400;
    throw error;
  }

  // format date and times
  const bDate = new Date(booking_date);
  // Assuming start_time and end_time are provided as HH:mm:ss strings, convert them for Prisma
  const sTime = new Date(`1970-01-01T${start_time}Z`);
  const eTime = new Date(`1970-01-01T${end_time}Z`);

  // 2. Check Availability
  const isAvailable = await bookingRepository.checkAvailability(cafe_id, bDate, sTime, eTime);
  if (!isAvailable) {
    const error = new Error('The selected time slot is not available');
    error.statusCode = 409;
    throw error;
  }

  // 3. Pricing Calculation
  let cafe_amount = Number(cafe.price_per_hour || 0) * hours;
  let event_service_amount = 0;
  let actual_package_id = package_id;
  let actual_event_service_id = null;

  // Check if package_id is a CAFE's own package
  if (package_id && cafe.cafe_packages) {
    const pkg = cafe.cafe_packages.find(p => String(p.id) === String(package_id));
    if (pkg) {
      // Cafe package price goes to cafe_amount (it belongs to the cafe)
      cafe_amount += Number(pkg.price !== null && pkg.price !== undefined ? pkg.price : 0);
    }
  }

  // If not found in cafe packages, it might be an external event service package
  if (package_id && event_service_amount === 0 && actual_event_service_id === null) {
    // Only check external if no cafe package matched
    const cafePackageFound = cafe.cafe_packages?.some(p => String(p.id) === String(package_id));
    if (!cafePackageFound) {
      const eventServiceRepo = require('../repositories/eventServiceRepository');
      const extService = await eventServiceRepo.findEventServiceById(package_id);
      if (extService) {
        // Check if event manager bank account is verified
        const prisma = require('../config/prisma');
        const eventProfile = await prisma.event_management_profiles.findFirst({
          where: { user_id: extService.user_id }
        });
        if (!eventProfile || String(eventProfile.bank_verification_status || '').toUpperCase() !== 'VERIFIED') {
          const error = new Error('Selected event service cannot be booked until the event manager verifies their bank account.');
          error.statusCode = 400;
          throw error;
        }

        event_service_amount += Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
        actual_event_service_id = package_id;
        actual_package_id = null; // It's an external service, not a cafe package
      }
    }
  }

  // If event_service_id is explicitly passed, fetch its price
  if (event_service_id && actual_event_service_id !== event_service_id) {
    const eventServiceRepo = require('../repositories/eventServiceRepository');
    const extService = await eventServiceRepo.findEventServiceById(event_service_id);
    if (extService) {
      event_service_amount += Number(extService.price !== null && extService.price !== undefined ? extService.price : 0);
      actual_event_service_id = event_service_id;
    }
  }

  // We'll trust food_amount, decoration_amount for now

  const subtotal = cafe_amount + food_amount + decoration_amount + extra_person_amount + event_service_amount - discount;

  // Apply Fahara Service Charge (4%)
  const fahara_service_charge = subtotal * 0.04;

  // Apply Transaction Fee (2% from total amount: subtotal + fahara_service_charge)
  const transaction_fee = (subtotal + fahara_service_charge) * 0.02;

  // Apply GST (18% from transaction fee)
  const gst = transaction_fee * 0.18;

  const total = subtotal + fahara_service_charge + transaction_fee + gst;

  // 4. Generate Booking Number
  const booking_number = bookingUtils.generateBookingNumber();

  // 5. Create Booking
  const bookingRecord = {
    booking_number,
    customer_id: userId,
    cafe_id,
    package_id: actual_package_id,
    event_service_id: actual_event_service_id,
    booking_date: bDate,
    start_time: sTime,
    end_time: eTime,
    hours,
    total_persons,
    cafe_amount,
    event_service_amount,
    food_amount,
    decoration_amount,
    extra_person_amount,
    subtotal,
    discount,
    fahara_service_charge,
    transaction_fee,
    gst,
    total,
    payment_status: 'PENDING',
    booking_status: 'PENDING',
    special_request,
  };

  const createdBooking = await bookingRepository.createBooking(bookingRecord);
  
  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(createdBooking.id);
  // Fire and forget notification
  notificationService.notifyBookingCreated(fullBooking).catch(err => console.error(err));

  return createdBooking;
};

const getMyBookings = async (userId) => {
  return await bookingRepository.getBookingsByCustomer(userId);
};

const getCafeBookings = async (ownerId, query = {}, userRole = 'CAFE_OWNER') => {
  let bookings = await bookingRepository.getBookingsByCafeOwner(ownerId, userRole);
  
  if (query.status && query.status.toUpperCase() !== 'ALL') {
    bookings = bookings.filter(b => b.booking_status.toUpperCase() === query.status.toUpperCase());
  }

  // Frontend expects mapped format
  return bookings.map(b => ({
    id: b.id,
    booking_number: b.booking_number,
    customerName: b.users?.name || 'Guest User',
    customerEmail: b.users?.email || 'N/A',
    customerPhone: b.users?.phone || 'N/A',

    cafeName: b.cafes?.name,
    date: b.booking_date,
    startTime: b.start_time,
    endTime: b.end_time,
    guests: b.total_persons,
    amount: userRole === 'EVENT_MANAGER' 
      ? Number(b.event_service_amount || 0) 
      : (b.event_service_id ? Number(b.subtotal || 0) - Number(b.event_service_amount || 0) : Number(b.subtotal || 0)),
    status: b.booking_status,
    paymentStatus: 'PAID', // Bookings usually have a related payment, defaulting to PAID if it exists
    createdAt: b.created_at,
    package_name: b.packages?.package_name || b.packages?.name || b.packages?.title || b.event_services?.service_name || b.event_services?.title || b.event_services?.name || 'Standard Package'
  }));
};

const getAllAdminBookings = async (query = {}) => {
  const bookings = await bookingRepository.getAllAdminBookings(query);

  return bookings.map(b => ({
    id: b.id,
    booking_number: b.booking_number,
    customerName: b.users?.name || 'Guest User',
    customerEmail: b.users?.email,
    customerPhone: b.users?.phone,
    cafeName: b.cafes?.name,
    eventManagerName: b.event_services?.users?.name || 'N/A',
    date: b.booking_date,
    startTime: b.start_time,
    endTime: b.end_time,
    guests: b.total_persons,
    amount: Number(b.total || 0),
    status: b.booking_status,
    paymentStatus: b.payment_status,
    createdAt: b.created_at,
    package_name: b.packages?.package_name || b.packages?.name || b.packages?.title || 'Standard Package',
    event_service_name: b.event_services?.service_name || b.event_services?.title || b.event_services?.name || 'N/A'
  }));
};

const sanitizeBookingForPartner = (booking) => {
  if (!booking) return booking;
  const sanitized = { ...booking };
  delete sanitized.fahara_service_charge;
  delete sanitized.gst;
  delete sanitized.transaction_fee;
  return sanitized;
};

const getBookingById = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  // Authorization check
  if (userRole === 'ADMIN') {
    return booking; // Admin can view any booking
  }

  if (userRole === 'CUSTOMER') {
    if (booking.customer_id !== userId) {
      const error = new Error('Unauthorized access to booking');
      error.statusCode = 403;
      throw error;
    }
    return booking;
  }

  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;

  if (userRole === 'CAFE_OWNER' && !isCafeOwner) {
    const error = new Error('Unauthorized access to booking');
    error.statusCode = 403;
    throw error;
  }

  if (userRole === 'EVENT_MANAGER' && !isEventManager) {
    const error = new Error('Unauthorized access to booking');
    error.statusCode = 403;
    throw error;
  }

  if (userRole === 'CAFE_OWNER' || userRole === 'EVENT_MANAGER') {
    return sanitizeBookingForPartner(booking);
  }

  return booking;
};

const updateBookingStatus = async (id, userId, status) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  // Only Cafe Owner or Event Manager can update the status
  const isCafeOwner = booking.cafes.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;

  if (!isCafeOwner && !isEventManager) {
    const error = new Error('Unauthorized to update this booking status');
    error.statusCode = 403;
    throw error;
  }

  // Prevent duplicate status updates and emails
  if (booking.booking_status === status || booking.payment_status === status) {
    return booking;
  }

  // Process refund if cafe owner cancels a paid booking
  if (status === 'CANCELLED' && booking.payment_status === 'PAID') {
    const paymentService = require('./paymentService');
    await paymentService.processRefund(id);
    await bookingRepository.updateBookingPaymentStatus(id, 'REFUNDED');
  }

  const updatedBooking = await bookingRepository.updateBookingStatus(id, status);
  
  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(id);
  const actorRole = isCafeOwner ? 'Cafe Owner' : 'Event Manager';
  // Fire and forget notification
  notificationService.notifyBookingStatusUpdated(fullBooking, status, actorRole).catch(err => console.error(err));

  return updatedBooking;
};

const cancelBooking = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }

  const isCustomer = booking.customer_id === userId;
  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;
  const isAdmin = userRole === 'ADMIN';

  if (!isCustomer && !isCafeOwner && !isEventManager && !isAdmin) {
    const error = new Error('Unauthorized to cancel this booking');
    error.statusCode = 403;
    throw error;
  }

  if (booking.booking_status === 'CANCELLED') {
    const error = new Error('Booking is already cancelled');
    error.statusCode = 400;
    throw error;
  }

  // Customer cancellation rule: allowed ONLY within 3 hours from the time of booking creation
  if (isCustomer && !isAdmin && !isCafeOwner && !isEventManager) {
    const now = new Date();
    const bookingCreatedAt = new Date(booking.created_at || now);
    const hoursSinceBookingCreated = (now.getTime() - bookingCreatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceBookingCreated > 3) {
      const error = new Error('Cancellations are allowed only within 3 hours from the time of booking creation.');
      error.statusCode = 400;
      throw error;
    }
  }

  // Process refund if paid
  if (booking.payment_status === 'PAID') {
    await paymentService.processRefund(id);
    await bookingRepository.updateBookingPaymentStatus(id, 'REFUNDED');
  }

  const updatedBooking = await bookingRepository.updateBookingStatus(id, 'CANCELLED');
  
  // Fetch full details for notification
  const fullBooking = await bookingRepository.getBookingById(id);
  let actorRole = 'Customer';
  if (isAdmin) actorRole = 'Admin';
  else if (isCafeOwner) actorRole = 'Cafe Owner';
  else if (isEventManager) actorRole = 'Event Manager';

  notificationService.notifyBookingStatusUpdated(fullBooking, 'CANCELLED', actorRole).catch(err => console.error(err));

  return updatedBooking;
};

const deleteBooking = async (id, userId, userRole) => {
  const booking = await bookingRepository.getBookingById(id);
  if (!booking) {
    const error = new Error('Booking not found');
    error.statusCode = 404;
    throw error;
  }
  
  const isCustomer = booking.customer_id === userId;
  const isCafeOwner = booking.cafes?.owner_id === userId;
  const isEventManager = booking.event_services?.user_id === userId;
  const isAdmin = userRole === 'ADMIN';

  if (!isCustomer && !isCafeOwner && !isEventManager && !isAdmin) {
    const error = new Error('Unauthorized to delete this booking');
    error.statusCode = 403;
    throw error;
  }
  
  // Actually delete the booking using Prisma
  return await bookingRepository.deleteBooking(booking.id);
};

module.exports = {
  createBooking,
  getMyBookings,
  getCafeBookings,
  getAllAdminBookings,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  deleteBooking,
};
