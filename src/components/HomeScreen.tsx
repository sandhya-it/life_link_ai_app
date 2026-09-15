import React, { useState, useEffect, useRef } from 'react';
import { 
  getSupabase, mockDB, startAmbulanceSimulation, 
  stopAmbulanceSimulation, realtimeEvents, playEmergencyAlertSound 
} from '../lib/supabase';
import { UserRole, SosEvent, AmbulanceLocation, SosStatus, DoctorReview } from '../types';
import LiveGpsMap from './LiveGpsMap';
import { 
  HeartPulse, User, Navigation, MapPin, Activity, 
  PhoneCall, BellRing, Ambulance, ChevronRight, 
  ShieldAlert, Clock, AlertOctagon, RefreshCw, CheckCircle2, 
  X, Compass, Stethoscope, Check, ShieldCheck, Phone, AlertTriangle,
  Info, ExternalLink
} from 'lucide-react';

interface HomeScreenProps {
  userId: string;
  fullName: string;
  isSupabaseLive: boolean;
  onNavigateToTab: (tab: string) => void;
  activeEvent: SosEvent | null;
  setActiveEvent: (event: SosEvent | null) => void;
  appLanguage: 'en' | 'ta' | 'hi';
}

export default function HomeScreen({ 
  userId, 
  fullName, 
  isSupabaseLive, 
  onNavigateToTab,
  activeEvent,
  setActiveEvent,
  appLanguage
}: HomeScreenProps) {
  const [sosState, setSosState] = useState<'idle' | 'pressing' | 'triggered'>('idle');
  const [pressProgress, setPressProgress] = useState(0);
  const [eta, setEta] = useState('En Route');
  const [ambulanceLoc, setAmbulanceLoc] = useState<AmbulanceLocation | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showDoctorReviewModal, setShowDoctorReviewModal] = useState<boolean>(false);
  const [reviewNoticeBanner, setReviewNoticeBanner] = useState<boolean>(false);

  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAlertedReviewTimeRef = useRef<string | null>(null);

  // Localization strings
  const locDict = {
    en: {
      alertSent: "Emergency Alert Sent",
      pressHold: "Tap and hold for 2 seconds to send an emergency alert",
      reassurance: "Response team and emergency physician have been notified. Stay calm.",
      cancel: "Cancel Emergency Alert",
      etaBanner: "Ambulance en route",
      status1: "Alert Sent",
      status2: "Doctor Reviewed",
      status3: "Ambulance Dispatched",
      status4: "Arrival",
      patientLoc: "Patient Location",
      ambulanceLoc: "Ambulance",
      gpsCoords: "Capturing GPS Coordinates...",
      connecting: "Establishing LifeLink Connection...",
      secondsRemaining: "Hold to send alert..."
    },
    ta: {
      alertSent: "அவசரகால எச்சரிக்கை அனுப்பப்பட்டது",
      pressHold: "அவசரகால எச்சரிக்கை அனுப்ப 2 விநாடிகள் அழுத்திப் பிடிக்கவும்",
      reassurance: "பதில் குழு மற்றும் மருத்துவருக்கு தகவல் தெரிவிக்கப்பட்டுள்ளது. அமைதியாக இருங்கள்.",
      cancel: "எச்சரிக்கையை ரத்துசெய்",
      etaBanner: "ஆம்புலன்ஸ் விரைந்து வருகிறது",
      status1: "எச்சரிக்கை அனுப்பப்பட்டது",
      status2: "மருத்துவர் மதிப்பாய்வு செய்தார்",
      status3: "ஆம்புலன்ஸ் கிளம்பியது",
      status4: "வந்து சேர்ந்தது",
      patientLoc: "நோயாளி இருப்பிடம்",
      ambulanceLoc: "ஆம்புலன்ஸ்",
      gpsCoords: "ஜிபிஎஸ் இருப்பிடத்தை பெறுகிறது...",
      connecting: "லைஃப்லிங்க் இணைப்பை நிறுவுகிறது...",
      secondsRemaining: "அழுத்திப் பிடிக்கவும்..."
    },
    hi: {
      alertSent: "आपातकालीन अलर्ट भेजा गया",
      pressHold: "आपातकालीन अलर्ट भेजने के लिए 2 सेकंड दबाकर रखें",
      reassurance: "प्रतिक्रिया टीम और आपातकालीन चिकित्सक को सूचित कर दिया गया है। शांत रहें।",
      cancel: "अलर्ट रद्द करें",
      etaBanner: "एम्बुलेंस आ रही है",
      status1: "अलर्ट भेजा गया",
      status2: "डॉक्टर द्वारा समीक्षा",
      status3: "एम्बुलेंस रवाना",
      status4: "आगमन",
      patientLoc: "मरीज का स्थान",
      ambulanceLoc: "एम्बुलेंस",
      gpsCoords: "जीपीएस निर्देशांक कैप्चर हो रहे हैं...",
      connecting: "लाइफलिंक कनेक्शन स्थापित हो रहा है...",
      secondsRemaining: "दबाकर रखें..."
    }
  };

  const strings = locDict[appLanguage] || locDict.en;

  // Handle incoming doctor reviews & notifications
  const handleIncomingDoctorReview = (review: DoctorReview) => {
    if (lastAlertedReviewTimeRef.current !== review.reviewed_at) {
      lastAlertedReviewTimeRef.current = review.reviewed_at;
      // Play audible chime
      playEmergencyAlertSound('doctor_review');
      // Show notification banner & modal
      setReviewNoticeBanner(true);
      setShowDoctorReviewModal(true);
    }
  };

  // Track ambulance real-time updates & doctor review
  useEffect(() => {
    if (!activeEvent) {
      setSosState('idle');
      setAmbulanceLoc(null);
      lastAlertedReviewTimeRef.current = null;
      return;
    }

    setSosState('triggered');

    // If event already has a doctor review that wasn't alerted yet
    if (activeEvent.doctor_review) {
      handleIncomingDoctorReview(activeEvent.doctor_review);
    }

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        const eventChannel = supabase
          .channel(`sos_event_${activeEvent.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'sos_events', filter: `id=eq.${activeEvent.id}` },
            (payload) => {
              const updated = payload.new as SosEvent;
              setActiveEvent(updated);
              if (updated.doctor_review) {
                handleIncomingDoctorReview(updated.doctor_review);
              }
            }
          )
          .subscribe();

        const ambulanceChannel = supabase
          .channel(`ambulance_${activeEvent.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'ambulance_locations', filter: `sos_event_id=eq.${activeEvent.id}` },
            (payload) => {
              setAmbulanceLoc(payload.new as AmbulanceLocation);
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(eventChannel);
          supabase.removeChannel(ambulanceChannel);
        };
      }
    } else {
      // Offline/Sandbox real-time simulation
      const unsubscribeSos = realtimeEvents.on('sos_events_change', (updatedEvents: SosEvent[]) => {
        const match = updatedEvents.find(e => e.id === activeEvent.id);
        if (match) {
          setActiveEvent(match);
          if (match.doctor_review) {
            handleIncomingDoctorReview(match.doctor_review);
          }
        }
      });

      const unsubscribeDoctorReviewed = realtimeEvents.on('doctor_reviewed', (payload: { eventId: string; review: DoctorReview }) => {
        if (payload.eventId === activeEvent.id) {
          handleIncomingDoctorReview(payload.review);
          setActiveEvent({
            ...activeEvent,
            doctor_review: payload.review
          });
        }
      });

      const unsubscribeAmbulance = realtimeEvents.on('ambulance_change', (locs: AmbulanceLocation[]) => {
        const match = locs.find(l => l.sos_event_id === activeEvent.id);
        if (match) {
          setAmbulanceLoc(match);
        }
      });

      // Start the simulation of moving ambulance toward patient
      startAmbulanceSimulation(activeEvent.id, activeEvent.latitude, activeEvent.longitude);

      return () => {
        unsubscribeSos();
        unsubscribeDoctorReviewed();
        unsubscribeAmbulance();
        stopAmbulanceSimulation(activeEvent.id);
      };
    }
  }, [activeEvent?.id, isSupabaseLive]);

  // Press-and-hold handlers
  const handlePressStart = () => {
    setSosState('pressing');
    setPressProgress(0);
    setLocationError(null);

    const startTime = Date.now();
    const duration = 2000;

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / duration) * 100, 100);
      setPressProgress(progress);
    }, 40);

    pressTimerRef.current = setTimeout(() => {
      triggerSosAlert();
    }, duration);
  };

  const handlePressEnd = () => {
    if (sosState === 'pressing') {
      setSosState('idle');
      setPressProgress(0);
      if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
  };

  const triggerSosAlert = async () => {
    if (pressTimerRef.current) clearTimeout(pressTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);

    setPressProgress(100);

    // Geolocation capture
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by this browser.");
      fallbackSosTrigger(37.774929, -122.419416);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        await createSosEventRecord(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.warn("Geolocation permission fallback triggered:", error);
        setLocationError("Using default emergency dispatch coordinates.");
        createSosEventRecord(13.0827, 80.2707);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const fallbackSosTrigger = async (lat: number, lng: number) => {
    await createSosEventRecord(lat, lng);
  };

  const createSosEventRecord = async (lat: number, lng: number) => {
    const eventId = `sos-${Date.now()}`;
    const passports = mockDB.getPassports();
    const userPassport = passports.find(p => p.user_id === userId);

    const newEvent: SosEvent = {
      id: eventId,
      user_id: userId,
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      status: 'pending',
      created_at: new Date().toISOString(),
      resolved_at: null,
      patient_name: fullName,
      patient_passport: userPassport
    };

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error } = await supabase.from('sos_events').insert(newEvent);
          if (error) throw error;
          setActiveEvent(newEvent);
        } catch (err: any) {
          console.error('Failed to post live SOS:', err);
          const mockEvents = mockDB.getSosEvents();
          mockEvents.push(newEvent);
          mockDB.setSosEvents(mockEvents);
          setActiveEvent(newEvent);
        }
      }
    } else {
      const mockEvents = mockDB.getSosEvents();
      mockEvents.push(newEvent);
      mockDB.setSosEvents(mockEvents);
      setActiveEvent(newEvent);
    }
  };

  const handleCancelAlert = async () => {
    if (!activeEvent) return;

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase
            .from('sos_events')
            .update({ status: 'resolved', resolved_at: new Date().toISOString() })
            .eq('id', activeEvent.id);
        } catch (err) {
          console.error('Cancel alert live failed:', err);
        }
      }
    } else {
      stopAmbulanceSimulation(activeEvent.id);
      const events = mockDB.getSosEvents();
      const updated = events.map(e => e.id === activeEvent.id ? { 
        ...e, 
        status: 'resolved' as SosStatus, 
        resolved_at: new Date().toISOString() 
      } : e);
      mockDB.setSosEvents(updated);
    }

    setActiveEvent(null);
    setSosState('idle');
    setPressProgress(0);
    setShowDoctorReviewModal(false);
    setReviewNoticeBanner(false);
  };

  return (
    <div id="homescreen-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20">
      
      {/* 1. IDLE/HOME STATE */}
      {sosState === 'idle' && (
        <div className="flex flex-col flex-1 px-6 pt-6 pb-4 justify-between h-full">
          {/* Top Header */}
          <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-teal-50 text-teal-600 rounded-xl">
                <HeartPulse size={22} className="animate-pulse" />
              </div>
              <div>
                <h2 className="font-sans font-extrabold text-gray-900 text-lg tracking-tight leading-none">LifeLink AI</h2>
                <p className="text-[9px] text-teal-600 font-bold uppercase tracking-widest mt-1">Predict. Protect. Respond.</p>
              </div>
            </div>
            
            <button 
              onClick={() => onNavigateToTab('profile')}
              className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 transition border border-gray-200 cursor-pointer"
            >
              <User size={18} />
            </button>
          </div>

          {/* Quick Informational Stats Banner */}
          <div className="mt-4 bg-teal-700 text-white p-5 rounded-2xl relative overflow-hidden shadow-sm border border-teal-800">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[9px] bg-teal-800/80 text-teal-100 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                Live Emergency System Active
              </span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-300 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-300"></span>
              </span>
            </div>
            <h3 className="font-sans font-bold text-base mb-1">Welcome back, {fullName.split(' ')[0]}</h3>
            <p className="text-xs text-teal-50/90 leading-relaxed font-normal">
              Your Health Passport is synced. In an emergency, our on-call physician and paramedics instantly receive your critical allergies and blood type.
            </p>
          </div>

          {/* Centered Large Red SOS Button Section */}
          <div className="flex flex-col items-center justify-center py-8 my-auto">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-64 h-64 rounded-full bg-red-50 border border-red-100 flex items-center justify-center opacity-60"></div>
              <div className="absolute w-52 h-52 rounded-full bg-red-100/40 flex items-center justify-center animate-pulse opacity-50"></div>

              <button
                onMouseDown={handlePressStart}
                onMouseUp={handlePressEnd}
                onMouseLeave={handlePressEnd}
                onTouchStart={(e) => { e.preventDefault(); handlePressStart(); }}
                onTouchEnd={(e) => { e.preventDefault(); handlePressEnd(); }}
                className="relative z-10 w-44 h-44 rounded-full bg-red-650 hover:bg-red-700 text-white flex flex-col items-center justify-center border-8 border-white shadow-[0_0_50px_rgba(220,38,38,0.35)] transition-all active:scale-95 select-none cursor-pointer"
              >
                <ShieldAlert size={44} className="text-white drop-shadow-sm" />
                <span className="font-sans font-black text-3xl tracking-tight mt-1 drop-shadow-sm">SOS</span>
                <span className="text-[9px] font-extrabold uppercase tracking-widest text-red-100 mt-1">HOLD 2S</span>
              </button>
            </div>

            <p className="text-center text-sm font-semibold text-gray-800 max-w-xs leading-normal mt-8 mb-2">
              {strings.pressHold}
            </p>
            <span className="text-center text-[11px] text-gray-400 font-medium">
              Geolocates you and connects you directly with on-call physicians & paramedics
            </span>
          </div>

          {/* Help Banner */}
          <div className="bg-white border border-gray-200 p-4 rounded-2xl flex gap-3 items-center">
            <AlertOctagon size={20} className="text-teal-600 shrink-0" />
            <div className="text-xs text-gray-600 leading-relaxed font-normal">
              <strong>Need immediate first aid advice?</strong> Go to the <strong>First Aid Chat</strong> tab below to get dynamic triage steps for burns, choking, or bleeding.
            </div>
          </div>
        </div>
      )}

      {/* 2. PRESSING/COUNTDOWN TRANSITIONAL STATE */}
      {sosState === 'pressing' && (
        <div className="flex flex-col flex-1 items-center justify-center bg-gray-950 px-6 text-white text-center h-full">
          <div className="relative flex items-center justify-center w-64 h-64 mb-8">
            <svg className="absolute w-60 h-60 transform -rotate-90">
              <circle
                cx="120"
                cy="120"
                r="100"
                className="stroke-gray-800 fill-transparent"
                strokeWidth="10"
              />
              <circle
                cx="120"
                cy="120"
                r="100"
                className="stroke-red-650 fill-transparent transition-all duration-75"
                strokeWidth="10"
                strokeDasharray="628"
                strokeDashoffset={628 - (628 * pressProgress) / 100}
                strokeLinecap="round"
              />
            </svg>
            
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-sans font-black text-6xl tracking-tight text-white">
                {Math.max(1, Math.ceil((100 - pressProgress) / 50))}s
              </span>
              <span className="text-[10px] uppercase tracking-widest text-red-400 font-bold mt-1">HOLDING</span>
            </div>
          </div>

          <h2 className="font-sans font-extrabold text-2xl tracking-tight text-white mb-2">
            Broadcasting Emergency SOS
          </h2>
          <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
            Keep holding! Releasing your finger now will cancel this emergency alert.
          </p>
        </div>
      )}

      {/* 3. SOS TRIGGERED & LIVE REAL GPS TRACKING VIEW */}
      {sosState === 'triggered' && activeEvent && (
        <div className="flex flex-col flex-1 h-full justify-between overflow-y-auto">
          
          {/* Top Real-time Header Status ETA */}
          <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm sticky top-0 z-30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-50 text-red-650 rounded-xl animate-pulse">
                <Ambulance size={20} />
              </div>
              <div>
                <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest block leading-none">
                  {strings.etaBanner}
                </span>
                <span className="text-sm font-sans font-extrabold text-gray-900 leading-tight">
                  {eta}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {activeEvent.doctor_review && (
                <button
                  onClick={() => setShowDoctorReviewModal(true)}
                  className="bg-teal-50 text-teal-750 border border-teal-200 hover:bg-teal-100 text-[10px] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider flex items-center gap-1 cursor-pointer transition shadow-xs"
                >
                  <Stethoscope size={12} />
                  <span>Dr. Review</span>
                </button>
              )}

              <span className="text-[10px] font-mono font-bold bg-red-50 text-red-650 px-2.5 py-1 rounded-lg uppercase border border-red-200 leading-none">
                {activeEvent.status}
              </span>
            </div>
          </div>

          {/* DOCTOR REVIEW NOTIFICATION POPUP BANNER (When doctor reviews) */}
          {reviewNoticeBanner && activeEvent.doctor_review && (
            <div className="bg-teal-700 text-white p-3.5 px-4 flex items-center justify-between shadow-md animate-slide-down border-b border-teal-800">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-white text-teal-800 rounded-xl shadow-xs">
                  <Stethoscope size={16} />
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-tight flex items-center gap-1.5">
                    <span>{activeEvent.doctor_review.doctor_name} has reviewed your case!</span>
                    <span className="bg-white/20 text-[9px] px-1.5 py-0.2 rounded uppercase">Verified</span>
                  </h4>
                  <p className="text-[11px] text-teal-100 line-clamp-1 mt-0.5">
                    {activeEvent.doctor_review.patient_instructions}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowDoctorReviewModal(true)}
                  className="bg-white text-teal-800 hover:bg-teal-50 font-extrabold text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-lg transition cursor-pointer shadow-sm"
                >
                  View Care Plan
                </button>
                <button
                  onClick={() => setReviewNoticeBanner(false)}
                  className="text-teal-200 hover:text-white p-1"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}

          {/* REAL LIVE GPS TRACKING MAP CONTAINER */}
          <div className="p-4 space-y-3">
            <LiveGpsMap 
              patientLat={activeEvent.latitude}
              patientLng={activeEvent.longitude}
              patientName={fullName}
              ambulanceLocation={ambulanceLoc}
              hospitalName={activeEvent.doctor_review?.assigned_hospital || 'Metro Central Hospital (Trauma 1)'}
              className="h-72 rounded-2xl"
              onEtaUpdate={(etaString) => setEta(etaString)}
            />

            {/* Warning indicator if GPS fallback was triggered */}
            {locationError && (
              <div className="bg-amber-500 text-white text-[11px] p-2.5 rounded-xl text-center shadow-sm font-medium">
                {locationError}
              </div>
            )}

            {/* DEDICATED DOCTOR'S CLINICAL REVIEW CARD */}
            {activeEvent.doctor_review ? (
              <div className="bg-white p-4 rounded-2xl border-2 border-teal-600/30 shadow-sm space-y-3">
                <div className="flex justify-between items-center border-b border-gray-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-teal-50 text-teal-700 rounded-lg">
                      <Stethoscope size={16} />
                    </div>
                    <div>
                      <h4 className="font-sans font-extrabold text-gray-900 text-xs tracking-tight">
                        {activeEvent.doctor_review.doctor_name}
                      </h4>
                      <p className="text-[10px] text-gray-400">
                        {activeEvent.doctor_review.doctor_specialty || 'Emergency Physician'}
                      </p>
                    </div>
                  </div>

                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                    activeEvent.doctor_review.triage_priority === 'critical'
                      ? 'bg-red-50 text-red-650 border border-red-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}>
                    {activeEvent.doctor_review.triage_priority} Triage
                  </span>
                </div>

                {/* Direct Patient Advice */}
                <div className="bg-teal-50/70 border border-teal-100 p-3 rounded-xl">
                  <span className="text-[9px] font-extrabold text-teal-850 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Info size={11} className="text-teal-700" /> Direct Specialist Guidance
                  </span>
                  <p className="text-xs text-teal-950 font-medium leading-relaxed">
                    "{activeEvent.doctor_review.patient_instructions}"
                  </p>
                </div>

                {/* Assigned Hospital */}
                <div className="flex justify-between items-center text-xs text-gray-600 pt-1">
                  <span className="text-[10px] text-gray-400 uppercase font-bold">Receiving Facility:</span>
                  <span className="font-bold text-gray-900 text-right">{activeEvent.doctor_review.assigned_hospital}</span>
                </div>

                <button
                  onClick={() => setShowDoctorReviewModal(true)}
                  className="w-full py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-teal-750 font-bold rounded-xl text-[11px] uppercase tracking-wider transition flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>View Complete Care Plan & Paramedic Directives</span>
                  <ExternalLink size={12} />
                </button>
              </div>
            ) : (
              <div className="bg-white p-3.5 rounded-2xl border border-gray-200 shadow-sm flex items-center gap-3">
                <div className="p-2 bg-teal-50 text-teal-600 rounded-xl animate-pulse shrink-0">
                  <Stethoscope size={18} />
                </div>
                <div className="text-xs">
                  <strong className="text-gray-900 block font-bold">On-Call Physician Triage Active</strong>
                  <span className="text-gray-500 text-[11px] leading-tight">
                    Emergency physician is currently evaluating your Health Passport and telemetry stream. You will be alerted instantly.
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Stepper Timeline & Cancel Action */}
          <div className="p-5 bg-white rounded-t-3xl border-t border-gray-200 shadow-xl space-y-4">
            <p className="text-xs text-center text-gray-500 font-medium flex items-center justify-center gap-1.5">
              <CheckCircle2 size={14} className="text-teal-600" />
              <span>{strings.reassurance}</span>
            </p>

            {/* 4-Step Emergency Timeline */}
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Step 1: Alert Sent */}
              <div className="space-y-1">
                <div className="mx-auto w-6 h-6 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center shadow-xs">
                  ✓
                </div>
                <p className="text-[10px] font-bold text-gray-900 leading-tight">
                  {strings.status1}
                </p>
                <span className="text-[9px] text-gray-400 block font-mono">
                  {new Date(activeEvent.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Step 2: Doctor Reviewed */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center transition ${
                  activeEvent.doctor_review
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-teal-50 text-teal-600 border border-teal-200 animate-pulse'
                }`}>
                  {activeEvent.doctor_review ? '✓' : '2'}
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status2}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.doctor_review ? 'Reviewed' : 'Reviewing'}
                </span>
              </div>

              {/* Step 3: Ambulance Dispatched */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeEvent.status === 'dispatched' || activeEvent.status === 'resolved'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-400 border border-gray-200'
                }`}>
                  {activeEvent.status === 'dispatched' || activeEvent.status === 'resolved' ? '✓' : '3'}
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status3}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.status === 'dispatched' ? 'En Route' : activeEvent.status === 'resolved' ? 'Arrived' : 'Standby'}
                </span>
              </div>

              {/* Step 4: Arrived */}
              <div className="space-y-1">
                <div className={`mx-auto w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                  activeEvent.status === 'resolved'
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-400 border border-gray-200'
                }`}>
                  4
                </div>
                <p className="text-[10px] font-bold text-gray-800 leading-tight">
                  {strings.status4}
                </p>
                <span className="text-[9px] text-gray-400 block">
                  {activeEvent.status === 'resolved' ? 'Complete' : 'Pending'}
                </span>
              </div>
            </div>

            {/* Cancel Emergency Button */}
            <button
              onClick={handleCancelAlert}
              className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-red-650 hover:text-red-700 font-bold rounded-2xl text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 border border-gray-200 cursor-pointer"
            >
              <X size={15} />
              <span>{strings.cancel}</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. DOCTOR REVIEW MODAL / CARE PLAN DIALOG */}
      {showDoctorReviewModal && activeEvent?.doctor_review && (
        <div className="absolute inset-0 z-50 bg-gray-950/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="flex-1" onClick={() => setShowDoctorReviewModal(false)}></div>
          
          <div className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-200 p-6 space-y-4 max-h-[85%] overflow-y-auto max-w-md w-full mx-auto animate-slide-up font-sans">
            
            {/* Modal Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-150">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-teal-50 text-teal-700 rounded-xl">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-teal-700 uppercase tracking-widest block">
                    PHYSICIAN CASE REVIEW NOTIFICATION
                  </span>
                  <h3 className="font-sans font-extrabold text-gray-900 text-base leading-tight">
                    {activeEvent.doctor_review.doctor_name}
                  </h3>
                </div>
              </div>

              <button 
                onClick={() => setShowDoctorReviewModal(false)}
                className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-full transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Verification Status */}
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-2xl flex items-center gap-2 text-xs text-emerald-900 font-medium">
              <ShieldCheck className="text-emerald-600 shrink-0" size={18} />
              <span>
                Your health records and GPS trajectory have been clinically reviewed by on-call emergency staff.
              </span>
            </div>

            {/* Direct Instructions to Patient */}
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200 space-y-1.5">
              <span className="text-[9px] font-extrabold text-gray-500 uppercase tracking-wider block">
                SPECIALIST INSTRUCTIONS FOR YOU
              </span>
              <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                "{activeEvent.doctor_review.patient_instructions}"
              </p>
            </div>

            {/* Orders Issued to Paramedics */}
            {activeEvent.doctor_review.orders.length > 0 && (
              <div className="space-y-2">
                <span className="text-[9px] font-extrabold text-gray-400 uppercase tracking-wider block">
                  ORDERS ISSUED TO PARAMEDIC CREW (EMS-04)
                </span>
                <div className="space-y-1.5">
                  {activeEvent.doctor_review.orders.map((order, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs font-semibold text-gray-800 bg-gray-50 p-2.5 rounded-xl border border-gray-150">
                      <Check size={14} className="text-teal-600 shrink-0" />
                      <span>{order}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hospital Allocation & Triage Badge */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-150">
                <span className="text-[9px] text-gray-400 font-bold uppercase block">Receiving Center</span>
                <span className="font-bold text-gray-900 block truncate mt-0.5">
                  {activeEvent.doctor_review.assigned_hospital}
                </span>
              </div>

              <div className="bg-gray-50 p-3 rounded-xl border border-gray-150">
                <span className="text-[9px] text-gray-400 font-bold uppercase block">Triage Classification</span>
                <span className="font-bold text-red-650 block mt-0.5 uppercase">
                  {activeEvent.doctor_review.triage_priority}
                </span>
              </div>
            </div>

            {/* Modal Confirm Action */}
            <div className="pt-2 border-t border-gray-150 flex gap-2">
              <button
                onClick={() => setShowDoctorReviewModal(false)}
                className="flex-1 py-3.5 bg-teal-700 hover:bg-teal-800 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-md cursor-pointer text-center"
              >
                Understood • Keep Calm & Await Paramedics
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
