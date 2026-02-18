import { Loader2, Sparkles, RefreshCw } from "lucide-react";

export default function AIIntelPanel({ 
  aiLoading, 
  aiResponse,
  onRefresh
}) {
  console.log('Raw AI Response:', aiResponse);
  
  // Parse the three sections from the response
  const parseSection = (text, sectionName) => {
    if (!text) {
      console.log(`${sectionName}: No text provided`);
      return "Not available";
    }
    
    console.log(`Parsing ${sectionName} from:`, text.substring(0, 200));
    
    // Try to find the section with various patterns
    const patterns = [
      // Pattern 1: "SECTION NAME: content" followed by next section or end
      new RegExp(`${sectionName}:\\s*([\\s\\S]*?)(?=\\n\\s*(?:OWNERS|LOCATION COUNT|ACCOUNT DETAILS):|$)`, 'i'),
      // Pattern 2: "**SECTION NAME:** content" (markdown bold)
      new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*(?:OWNERS|LOCATION COUNT|ACCOUNT DETAILS):|$)`, 'i'),
      // Pattern 3: Just the section name as a header
      new RegExp(`${sectionName}\\s*\\n([\\s\\S]*?)(?=\\n\\s*(?:OWNERS|LOCATION COUNT|ACCOUNT DETAILS)\\s*\\n|$)`, 'i')
    ];
    
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim()) {
        console.log(`${sectionName} matched with pattern ${i + 1}:`, match[1].trim().substring(0, 100));
        return match[1].trim();
      }
    }
    
    console.log(`${sectionName}: No match found`);
    return "Not available";
  };

  const owners = parseSection(aiResponse, "OWNERS");
  const locationCount = parseSection(aiResponse, "LOCATION COUNT");
  const accountDetails = parseSection(aiResponse, "ACCOUNT DETAILS");

  return (
    <div className="bg-[#0F172A]/80 rounded-[2rem] border border-slate-700 p-8 mt-10">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2.5 rounded-xl">
            {aiLoading ? (
              <Loader2 className="text-white animate-spin" size={20} />
            ) : (
              <Sparkles className="text-white" size={20} />
            )}
          </div>
          <h3 className="text-[11px] font-black uppercase italic tracking-[0.2em] text-white">
            AI Intel Radar
          </h3>
        </div>
        {onRefresh && !aiLoading && (
          <button
            onClick={onRefresh}
            className="flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase rounded-xl transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        )}
      </div>

      {aiLoading ? (
        <div className="text-center py-8">
          <Loader2 className="inline-block text-indigo-400 animate-spin mb-2" size={24} />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Analyzing account...
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Owners Section */}
          <div className="bg-[#071126] border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase text-indigo-300 mb-2">
              Owners / Management
            </div>
            <div className="text-[11px] font-bold text-slate-200 whitespace-pre-wrap">
              {owners}
            </div>
          </div>

          {/* Location Count Section */}
          <div className="bg-[#071126] border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase text-indigo-300 mb-2">
              Location Count
            </div>
            <div className="text-[11px] font-bold text-slate-200 whitespace-pre-wrap">
              {locationCount}
            </div>
          </div>

          {/* Account Details Section */}
          <div className="bg-[#071126] border border-slate-800 rounded-2xl p-4">
            <div className="text-[10px] font-black uppercase text-indigo-300 mb-2">
              Account Details
            </div>
            <div className="text-[11px] font-bold text-slate-200 whitespace-pre-wrap">
              {accountDetails}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

