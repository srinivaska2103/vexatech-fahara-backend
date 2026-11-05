const fs = require('fs');

const pagePath = 'vexatech-fahara-fd-cafe/app/owner/(dashboard)/delivery-staff/page.jsx';
let content = fs.readFileSync(pagePath, 'utf8');

if (!content.includes('Launch Driver Portal')) {
  // Add ExternalLink to lucide imports
  content = content.replace('  RefreshCw \n} from \'lucide-react\';', '  RefreshCw,\n  ExternalLink\n} from \'lucide-react\';');

  const oldButton = `<button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#E50914] hover:bg-[#B71C1C] text-xs font-black text-white rounded-xl cursor-pointer shadow-md shadow-[#E50914]/20 transition-all w-fit"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          Add Delivery Driver
        </button>`;

  const newButtons = `<div className="flex items-center gap-2">
          <a
            href="/delivery"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3.5 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-black rounded-xl cursor-pointer transition-all"
          >
            <ExternalLink className="w-4 h-4" />
            Launch Driver Portal
          </a>

          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#E50914] hover:bg-[#B71C1C] text-xs font-black text-white rounded-xl cursor-pointer shadow-md shadow-[#E50914]/20 transition-all w-fit"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            Add Delivery Driver
          </button>
        </div>`;

  content = content.replace(oldButton, newButtons);
  fs.writeFileSync(pagePath, content, 'utf8');
  console.log('Added Launch Driver Portal button to delivery staff header!');
}

