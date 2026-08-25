const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const prisma = require('../config/prisma');

exports.getBusinessProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await prisma.users.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        business_name: true,
        bank_name: true,
        account_holder: true,
        account_number: true,
        ifsc_code: true,
        address: true,
        city: true,
        state: true,
        country: true,
        pincode: true,
        profile_image: true,
        description: true,
        cafes: {
          take: 1,
          orderBy: { created_at: 'desc' }
        },
        event_management_profiles: true,
      }
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const { cafes, event_management_profiles, ...userData } = user;
    const cafe = cafes && cafes.length > 0 ? cafes[0] : null;
    const eventProf = event_management_profiles || null;

    // Fallback/autofill from created cafe or event profile if user profile fields are empty
    if (!userData.business_name) {
      userData.business_name = cafe?.name || eventProf?.company_name || '';
    }
    if (!userData.description) {
      userData.description = cafe?.description || eventProf?.description || '';
    }
    if (!userData.address) {
      userData.address = cafe?.address || eventProf?.address_line1 || '';
    }
    if (!userData.city) {
      userData.city = cafe?.city || eventProf?.city || '';
    }
    if (!userData.state) {
      userData.state = eventProf?.state || '';
    }
    if (!userData.pincode) {
      userData.pincode = eventProf?.pincode || '';
    }
    if (!userData.profile_image) {
      userData.profile_image = cafe?.cover_image || eventProf?.company_logo || '';
    }

    // Attach social and website URLs for event profiles
    const webUrl = eventProf?.website_url || null;
    const fbUrl = eventProf?.facebook_url || null;
    const liUrl = eventProf?.linkedin_url || null;
    const instaUrl = eventProf?.instagram_url || null;
    const ytUrl = eventProf?.youtube_url || null;

    userData.website_url = webUrl;
    userData.websiteUrl = webUrl;
    userData.website = webUrl;
    userData.facebook_url = fbUrl;
    userData.facebookUrl = fbUrl;
    userData.facebook = fbUrl;
    userData.linkedin_url = liUrl;
    userData.linkedinUrl = liUrl;
    userData.linkedin = liUrl;
    userData.instagram_url = instaUrl;
    userData.instagramUrl = instaUrl;
    userData.instagram = instaUrl;
    userData.social_media_url = instaUrl || webUrl;
    userData.socialMediaUrl = instaUrl || webUrl;
    userData.socialUrl = instaUrl || webUrl;
    userData.youtube_url = ytUrl;
    userData.youtubeUrl = ytUrl;

    res.json({ success: true, data: userData });
  } catch (error) {
    next(error);
  }
};

exports.updateBusinessProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      name, email, phone, password, business_name, 
      bank_name, account_holder, account_number, ifsc_code, 
      address, city, state, country, pincode, 
      profile_image, description,
      website_url, websiteUrl, website,
      facebook_url, facebookUrl, facebook,
      linkedin_url, linkedinUrl, linkedin,
      instagram_url, instagramUrl, instagram, social_media_url, socialMediaUrl, socialUrl,
      youtube_url, youtubeUrl, youtube
    } = req.body;
    
    let updateData = {
      name, email, phone, business_name, 
      bank_name, account_holder, account_number, 
      ifsc_code: ifsc_code ? String(ifsc_code).trim().toUpperCase() : undefined, 
      address, city, state, country, pincode, 
      profile_image, description 
    };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(password, salt);
    }
    
    // Do not attempt to update email if it belongs to the current user or if it's already registered by another user
    if (email) {
      const currentUser = await prisma.users.findUnique({ where: { id: userId } });
      if (currentUser && currentUser.email === email) {
        delete updateData.email;
      } else {
        const existingEmailUser = await prisma.users.findFirst({
          where: { email: email, NOT: { id: userId } }
        });
        if (existingEmailUser) {
          return res.status(400).json({ success: false, message: 'Email is already in use by another account' });
        }
      }
    }

    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: updateData
    });

    // Update social and website links on event_management_profiles if present
    const webVal = website_url || websiteUrl || website;
    const fbVal = facebook_url || facebookUrl || facebook;
    const liVal = linkedin_url || linkedinUrl || linkedin;
    const instaVal = instagram_url || instagramUrl || instagram || social_media_url || socialMediaUrl || socialUrl;
    const ytVal = youtube_url || youtubeUrl || youtube;

    if (webVal !== undefined || fbVal !== undefined || liVal !== undefined || instaVal !== undefined || ytVal !== undefined) {
      const eventProfileService = require('../services/eventProfileService');
      await eventProfileService.updateProfile(userId, {
        ...(webVal !== undefined ? { website_url: webVal } : {}),
        ...(fbVal !== undefined ? { facebook_url: fbVal } : {}),
        ...(liVal !== undefined ? { linkedin_url: liVal } : {}),
        ...(instaVal !== undefined ? { instagram_url: instaVal } : {}),
        ...(ytVal !== undefined ? { youtube_url: ytVal } : {})
      });
    }

    // Automatically sync updated bank details with Cashfree vendor accounts for any existing cafes/event profiles
    if (updatedUser.bank_name && updatedUser.account_number && updatedUser.ifsc_code) {
      try {
        const { syncVendorToCashfree } = require('../services/cashfreeVendorService');
        
        // Find cafes owned by this user
        const userCafes = await prisma.cafes.findMany({ where: { owner_id: userId } });
        for (const cafe of userCafes) {
          await syncVendorToCashfree(updatedUser, 'CAFE', cafe.id);
        }

        // Find event profiles owned by this user
        const userEvents = await prisma.event_management_profiles.findMany({ where: { user_id: userId } });
        for (const eventProf of userEvents) {
          await syncVendorToCashfree(updatedUser, 'EVENT_MANAGER', eventProf.id);
        }
      } catch (syncErr) {
        console.error('Failed to sync Cashfree vendor on profile update:', syncErr.message);
      }
    }
    
    res.json({ success: true, message: 'Profile updated successfully', data: updatedUser });
  } catch (error) {
    next(error);
  }
};

exports.deleteAccount = async (req, res, next) => {
  try {
    const userService = require('../services/userService');
    const result = await userService.deleteUserAccount(req.user.id);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
};
