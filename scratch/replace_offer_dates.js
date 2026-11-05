const fs = require('fs');
const path = require('path');

const filePath = path.resolve('d:/Srinivas/Fahara Web App/vexatech-fahara-fd-cafe/app/owner/(dashboard)/offers/page.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add ModernDateTimePicker import
if (!content.includes("import ModernDateTimePicker from '@/components/ui/ModernDateTimePicker';")) {
  content = content.replace(
    "import ModernDropdown from '@/components/ui/ModernDropdown';",
    "import ModernDropdown from '@/components/ui/ModernDropdown';\nimport ModernDateTimePicker from '@/components/ui/ModernDateTimePicker';"
  );
}

// 2. Replace native <input type="datetime-local" ... /> with <ModernDateTimePicker ... />
const oldDateInputs = `          {/* Schedule Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Start Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914]"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                End Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-[#FEE2E2] rounded-xl text-xs font-bold text-[#252525] outline-none focus:border-[#E50914]"
              />
            </div>
          </div>`;

const newDateInputs = `          {/* Schedule Dates with Custom Modern Pop-up Calendar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                Start Date & Time *
              </label>
              <ModernDateTimePicker
                value={startDate}
                onChange={setStartDate}
                label="Start Date & Time"
              />
            </div>

            <div>
              <label className="text-[10px] font-black text-[#252525] uppercase tracking-wider block mb-1">
                End Date & Time *
              </label>
              <ModernDateTimePicker
                value={endDate}
                onChange={setEndDate}
                label="End Date & Time"
              />
            </div>
          </div>`;

content = content.replace(oldDateInputs, newDateInputs);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Replaced native date picker with ModernDateTimePicker in offers/page.jsx!');

