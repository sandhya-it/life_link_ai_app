import React, { useState } from 'react';
import { UserRole, AppLanguage } from '../types';
import SupabaseConnector from './SupabaseConnector';
import { 
  User, Shield, Mail, Globe, Database, 
  Settings, LogOut, ChevronRight, FileText, HeartPulse 
} from 'lucide-react';

interface ProfileScreenProps {
  fullName: string;
  email: string;
  userRole: UserRole;
  isSupabaseLive: boolean;
  onNavigateToTab: (tab: string) => void;
  onLogout: () => void;
  appLanguage: AppLanguage;
  setAppLanguage: (lang: AppLanguage) => void;
  onCredentialsChange: () => void;
}

export default function ProfileScreen({
  fullName,
  email,
  userRole,
  isSupabaseLive,
  onNavigateToTab,
  onLogout,
  appLanguage,
  setAppLanguage,
  onCredentialsChange
}: ProfileScreenProps) {
  const [showDbConnector, setShowDbConnector] = useState(false);

  return (
    <div id="profile-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Profile Header Block */}
      <div className="bg-white p-6 border-b border-gray-150/80 shadow-sm rounded-b-3xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gray-100 border border-gray-250/50 flex items-center justify-center text-gray-900 font-sans font-bold text-xl uppercase shadow-sm">
            {fullName.charAt(0)}
          </div>
          <div className="space-y-0.5">
            <h2 className="font-sans font-extrabold text-gray-900 text-base tracking-tight leading-tight">{fullName}</h2>
            <p className="text-[11px] text-gray-500 flex items-center gap-1 font-sans">
              <Mail size={12} className="text-gray-400" /> {email}
            </p>
            <div className="inline-flex items-center gap-1.5 mt-1.5 bg-gray-100 border border-gray-250/60 text-gray-850 text-[9px] font-bold uppercase px-3 py-1 rounded-lg">
              <Shield size={10} className="text-gray-500" />
              <span>{userRole} view</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        
        {/* Supabase connection portal button */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150/70 shadow-sm space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className={`p-2 rounded-xl border ${isSupabaseLive ? 'bg-teal-50 text-teal-700 border-teal-100' : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                <Database size={16} />
              </div>
              <div>
                <h3 className="font-sans font-extrabold text-gray-950 text-xs uppercase tracking-wider">Supabase Status</h3>
                <p className="text-[10px] font-medium text-gray-400">
                  {isSupabaseLive ? 'Linked to live cloud project' : 'Running on Sandbox Local DB'}
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowDbConnector(!showDbConnector)}
              className="text-[10px] font-bold text-gray-800 hover:text-black bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200 shadow-sm transition uppercase tracking-wider cursor-pointer"
            >
              {showDbConnector ? 'Close' : 'Configure'}
            </button>
          </div>

          {/* Inline Connector Tray */}
          {showDbConnector && (
            <div className="pt-2 border-t border-gray-150">
              <SupabaseConnector 
                onClose={() => setShowDbConnector(false)}
                onConnectedStateChange={onCredentialsChange}
              />
            </div>
          )}
        </div>

        {/* Global language preferences selector */}
        <div className="bg-white p-4 rounded-2xl border border-gray-150/70 shadow-sm space-y-3">
          <div className="flex items-center gap-2.5 border-b border-gray-100 pb-2.5">
            <div className="p-2 bg-gray-50 text-gray-500 rounded-xl border border-gray-200">
              <Globe size={16} />
            </div>
            <div>
              <h3 className="font-sans font-extrabold text-gray-950 text-xs uppercase tracking-wider">System Language</h3>
              <p className="text-[10px] font-medium text-gray-400">Choose your preferred emergency tongue</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {(['en', 'ta', 'hi'] as AppLanguage[]).map((lang) => {
              const isActive = appLanguage === lang;
              return (
                <button
                  key={lang}
                  onClick={() => setAppLanguage(lang)}
                  className={`py-2.5 px-3 border rounded-xl text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer font-sans ${
                    isActive 
                      ? 'border-gray-900 bg-gray-900 text-white' 
                      : 'border-gray-250/70 hover:bg-gray-50 text-gray-500'
                  }`}
                >
                  <span>{lang === 'en' ? 'English' : lang === 'ta' ? 'தமிழ்' : 'हिंदी'}</span>
                  <span className={`text-[8px] font-bold tracking-widest uppercase ${isActive ? 'text-gray-300' : 'text-gray-400'}`}>
                    {lang === 'en' ? 'EN' : lang === 'ta' ? 'TA' : 'HI'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation list options */}
        <div className="bg-white rounded-2xl border border-gray-150/70 shadow-sm overflow-hidden divide-y divide-gray-100">
          
          {userRole === 'patient' && (
            <button
              onClick={() => onNavigateToTab('passport')}
              className="w-full p-4 flex justify-between items-center hover:bg-gray-50 text-left transition cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-50 text-gray-800 rounded-xl border border-gray-200/60">
                  <FileText size={16} />
                </div>
                <div>
                  <h4 className="font-sans font-extrabold text-gray-900 text-[11px] uppercase tracking-wider">Edit Health Passport</h4>
                  <p className="text-[10px] text-gray-450 leading-relaxed">Manage allergies, chronic medications, and emergency contacts</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-400" />
            </button>
          )}

          <button
            onClick={() => onNavigateToTab('chat')}
            className="w-full p-4 flex justify-between items-center hover:bg-gray-50 text-left transition cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-50 text-gray-850 rounded-xl border border-gray-200/60">
                <HeartPulse size={16} />
              </div>
              <div>
                <h4 className="font-sans font-extrabold text-gray-900 text-[11px] uppercase tracking-wider">First Aid Assistant Q&A</h4>
                <p className="text-[10px] text-gray-455 leading-relaxed">Speak or write to get dynamic medical treatment steps</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-gray-400" />
          </button>
        </div>

        {/* Logout button */}
        <button
          onClick={onLogout}
          className="w-full py-3.5 px-4 bg-white hover:bg-red-50/40 border border-gray-200 hover:border-red-100 text-red-600 font-bold rounded-2xl text-xs transition flex items-center justify-center gap-2 shadow-sm cursor-pointer uppercase tracking-wider"
        >
          <LogOut size={14} />
          <span>Log Out Securely</span>
        </button>

        {/* Credits */}
        <p className="text-center text-[9px] text-gray-400 font-extrabold tracking-widest uppercase py-6">
          LifeLink AI v2.1.0 • Predict. Protect. Respond.
        </p>

      </div>
    </div>
  );
}
