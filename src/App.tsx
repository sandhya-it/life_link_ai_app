import React, { useState, useEffect } from 'react';
import { 
  getSupabase, getMockSessionUser, setMockSessionUser, 
  getSupabaseCredentials, mockDB, realtimeEvents, playEmergencyAlertSound 
} from './lib/supabase';
import { UserRole, SosEvent, AppLanguage, DoctorReview } from './types';
import AuthScreen from './components/AuthScreen';
import HomeScreen from './components/HomeScreen';
import PassportScreen from './components/PassportScreen';
import ChatScreen from './components/ChatScreen';
import DashboardScreen from './components/DashboardScreen';
import ProfileScreen from './components/ProfileScreen';
import { 
  HeartPulse, FileText, HeartHandshake, User, 
  ShieldAlert, Database, HelpCircle, Stethoscope, ChevronRight, X
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<{ id: string; email: string; role: UserRole; full_name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<string>('home');
  const [isSupabaseLive, setIsSupabaseLive] = useState<boolean>(false);
  const [appLanguage, setAppLanguage] = useState<AppLanguage>('en');
  const [activeSosEvent, setActiveSosEvent] = useState<SosEvent | null>(null);
  const [showGlobalDoctorBanner, setShowGlobalDoctorBanner] = useState<boolean>(false);

  // Check Supabase connectivity state & session
  const checkConnectivityAndSession = async () => {
    const credentials = getSupabaseCredentials();
    const isLive = credentials !== null;
    setIsSupabaseLive(isLive);

    if (isLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            // Get user profile details
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            const userRole = (profile?.role as UserRole) || 'patient';
            const fullName = profile?.full_name || session.user.user_metadata?.full_name || 'Alex Mercer';

            setUser({
              id: session.user.id,
              email: session.user.email || '',
              role: userRole,
              full_name: fullName
            });

            // If patient, check for active SOS event in DB
            if (userRole === 'patient') {
              const { data: activeEvent } = await supabase
                .from('sos_events')
                .select('*')
                .eq('user_id', session.user.id)
                .neq('status', 'resolved')
                .order('created_at', { ascending: false })
                .limit(1);

              if (activeEvent && activeEvent.length > 0) {
                setActiveSosEvent(activeEvent[0] as SosEvent);
              }
            }

            // Route clinicians to dashboard, patients to home SOS button
            setActiveTab(userRole === 'patient' ? 'home' : 'dashboard');
            return;
          }
        } catch (err) {
          console.error('Error during live session retrieval:', err);
        }
      }
    }

    // Fallback Mock session check
    const mockUser = getMockSessionUser();
    if (mockUser) {
      setUser({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        full_name: mockUser.full_name
      });

      // If mock user is patient, check for active mock SOS event
      if (mockUser.role === 'patient') {
        const events = mockDB.getSosEvents();
        const pendingEvent = events.find(e => e.user_id === mockUser.id && e.status !== 'resolved');
        if (pendingEvent) {
          setActiveSosEvent(pendingEvent);
        }
      }

      setActiveTab(mockUser.role === 'patient' ? 'home' : 'dashboard');
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    checkConnectivityAndSession();
    
    // Listen for custom mock authentication updates or credentials change
    const handleStorageUpdate = () => {
      checkConnectivityAndSession();
    };
    window.addEventListener('storage', handleStorageUpdate);

    // Listen for real-time doctor reviews to notify patient anywhere in the app
    const unsubDoctor = realtimeEvents.on('doctor_reviewed', (payload: { eventId: string; review: DoctorReview }) => {
      setActiveSosEvent(prev => {
        if (prev && prev.id === payload.eventId) {
          return { ...prev, doctor_review: payload.review };
        }
        return prev;
      });
      playEmergencyAlertSound('doctor_review');
      setShowGlobalDoctorBanner(true);
    });

    return () => {
      window.removeEventListener('storage', handleStorageUpdate);
      unsubDoctor();
    };
  }, []);

  const handleAuthSuccess = (authenticatedUser: { id: string; email: string; role: UserRole; full_name: string }) => {
    setUser(authenticatedUser);
    
    // Check if there are active events for this newly logged-in patient
    if (authenticatedUser.role === 'patient') {
      const events = mockDB.getSosEvents();
      const pendingEvent = events.find(e => e.user_id === authenticatedUser.id && e.status !== 'resolved');
      if (pendingEvent) {
        setActiveSosEvent(pendingEvent);
      }
    }

    setActiveTab(authenticatedUser.role === 'patient' ? 'home' : 'dashboard');
  };

  const handleLogout = async () => {
    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    }
    setMockSessionUser(null);
    setUser(null);
    setActiveSosEvent(null);
    setActiveTab('home');
  };

  const handleCredentialsChange = () => {
    checkConnectivityAndSession();
  };

  // Render proper screen according to role and current active tab
  const renderTabContent = () => {
    if (!user) return null;

    switch (activeTab) {
      case 'home':
        return (
          <HomeScreen
            userId={user.id}
            fullName={user.full_name}
            isSupabaseLive={isSupabaseLive}
            onNavigateToTab={setActiveTab}
            activeEvent={activeSosEvent}
            setActiveEvent={setActiveSosEvent}
            appLanguage={appLanguage}
          />
        );
      case 'passport':
        return (
          <PassportScreen
            userId={user.id}
            isSupabaseLive={isSupabaseLive}
            appLanguage={appLanguage}
          />
        );
      case 'chat':
        return (
          <ChatScreen
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
          />
        );
      case 'dashboard':
        return (
          <DashboardScreen
            isSupabaseLive={isSupabaseLive}
            userId={user.id}
            userRole={user.role}
          />
        );
      case 'profile':
        return (
          <ProfileScreen
            fullName={user.full_name}
            email={user.email}
            userRole={user.role}
            isSupabaseLive={isSupabaseLive}
            onNavigateToTab={setActiveTab}
            onLogout={handleLogout}
            appLanguage={appLanguage}
            setAppLanguage={setAppLanguage}
            onCredentialsChange={handleCredentialsChange}
          />
        );
      default:
        return null;
    }
  };

  // If user is not authenticated, display Auth Screen
  if (!user) {
    return (
      <div className="bg-slate-50 min-h-screen">
        <AuthScreen 
          onAuthSuccess={handleAuthSuccess} 
          isSupabaseLive={isSupabaseLive} 
        />
      </div>
    );
  }

  return (
    <div className="bg-slate-100 min-h-screen flex flex-col justify-between">
      {/* Container to restrict width on desktop screens for native mobile-first feel */}
      <div className="flex-1 w-full max-w-md mx-auto bg-slate-50 shadow-2xl flex flex-col relative h-screen overflow-hidden">
        
        {/* Floating Global Doctor Review Notification Banner when on other tabs */}
        {showGlobalDoctorBanner && activeSosEvent?.doctor_review && activeTab !== 'home' && (
          <div className="absolute top-3 left-4 right-4 z-50 bg-teal-700 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between animate-bounce border border-teal-800">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-white text-teal-700 rounded-lg shrink-0">
                <Stethoscope size={16} />
              </div>
              <div>
                <span className="text-[9px] uppercase font-bold text-teal-200 block leading-tight">
                  Emergency Doctor Orders Ready
                </span>
                <span className="text-xs font-bold leading-tight block truncate max-w-[190px]">
                  {activeSosEvent.doctor_review.doctor_name}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button 
                onClick={() => { setActiveTab('home'); setShowGlobalDoctorBanner(false); }}
                className="px-2.5 py-1 bg-white text-teal-800 hover:bg-teal-50 rounded-lg text-[10px] font-extrabold uppercase tracking-wider transition cursor-pointer shadow-xs"
              >
                View
              </button>
              <button 
                onClick={() => setShowGlobalDoctorBanner(false)} 
                className="p-1 text-teal-200 hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Main Screen Body */}
        <div className="flex-1 overflow-hidden flex flex-col h-full">
          {renderTabContent()}
        </div>

        {/* BOTTOM NAVIGATION TRAY */}
        <nav className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200/60 py-2.5 px-6 flex justify-between items-center z-40 shadow-[0_-4px_24px_rgba(15,23,42,0.04)] rounded-t-2xl">
          {/* Patient Views bottom tray navigation layout */}
          {user.role === 'patient' ? (
            <>
              {/* Home / SOS */}
              <button
                onClick={() => {
                  setActiveTab('home');
                  setShowGlobalDoctorBanner(false);
                }}
                className={`flex flex-col items-center gap-1 transition relative ${
                  activeTab === 'home' ? 'text-red-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <div className="relative">
                  <ShieldAlert size={20} className={activeSosEvent ? 'animate-pulse text-red-600' : ''} />
                  {activeSosEvent?.doctor_review && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-teal-500 rounded-full ring-2 ring-white"></span>
                  )}
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider">Home</span>
              </button>

              {/* Passport */}
              <button
                onClick={() => setActiveTab('passport')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'passport' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <FileText size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Passport</span>
              </button>

              {/* Chat */}
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'chat' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <HeartPulse size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Chat</span>
              </button>

              {/* Profile */}
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'profile' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <User size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Profile</span>
              </button>
            </>
          ) : (
            <>
              {/* Clinician Command View Navigation Layout */}
              {/* Dashboard */}
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'dashboard' ? 'text-red-600 font-bold' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <ShieldAlert size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Command</span>
              </button>

              {/* Chat */}
              <button
                onClick={() => setActiveTab('chat')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'chat' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <HeartPulse size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Chat</span>
              </button>

              {/* Profile */}
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex flex-col items-center gap-1 transition ${
                  activeTab === 'profile' ? 'text-teal-600' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <User size={20} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Profile</span>
              </button>
            </>
          )}
        </nav>
      </div>
    </div>
  );
}
