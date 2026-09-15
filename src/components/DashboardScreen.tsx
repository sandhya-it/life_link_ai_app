import React, { useState, useEffect } from 'react';
import { 
  getSupabase, mockDB, realtimeEvents, startAmbulanceSimulation, 
  stopAmbulanceSimulation, saveDoctorReview, playEmergencyAlertSound 
} from '../lib/supabase';
import { SosEvent, HealthPassport, SosStatus, DoctorReview, AmbulanceLocation } from '../types';
import LiveGpsMap from './LiveGpsMap';
import { 
  HeartPulse, ShieldAlert, Ambulance, CheckCircle2, MapPin, 
  User, Calendar, Clock, ArrowRight, FileText, Phone, Award, 
  AlertTriangle, AlertCircle, RefreshCw, X, Stethoscope, Send, 
  Radio, Volume2, VolumeX, Sparkles, Activity, Bed, ChevronRight,
  ClipboardCheck, Navigation, ShieldCheck, Check
} from 'lucide-react';

interface DashboardScreenProps {
  isSupabaseLive: boolean;
  userId: string;
  userRole: string;
}

const PRESET_HOSPITALS = [
  'Metro Central Hospital (Trauma 1)',
  'City General Emergency & Trauma',
  'St. Jude Cardiac Care Center',
  'Valley Memorial Children & ER'
];

const PRESET_CLINICAL_ORDERS = [
  'High-Flow O2 (15L NRB Mask)',
  '18G Large-Bore IV Access + Normal Saline',
  'Severe Penicillin Allergy - NO Beta Lactams',
  'Prep Trauma Resus Bay 1 & Notify Anesthesiology',
  'Pre-Alert Cardiac Cath Lab for Immediate ECG/Angio',
  'Spinal Precautions & C-Collar Immobilization',
  'Continuous Pulse Oximetry & Cardiac Telemetry'
];

export default function DashboardScreen({ isSupabaseLive, userId, userRole }: DashboardScreenProps) {
  const [sosEvents, setSosEvents] = useState<SosEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SosEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [ambulanceLocations, setAmbulanceLocations] = useState<{ [eventId: string]: AmbulanceLocation }>({});
  
  // Interactive filters
  const [activeFilter, setActiveFilter] = useState<'all' | 'needs_review' | 'dispatched' | 'reviewed' | 'resolved'>('all');
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);

  // Review form state for selected case
  const [triagePriority, setTriagePriority] = useState<'critical' | 'urgent' | 'moderate'>('critical');
  const [assignedHospital, setAssignedHospital] = useState(PRESET_HOSPITALS[0]);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([
    'High-Flow O2 (15L NRB Mask)',
    '18G Large-Bore IV Access + Normal Saline'
  ]);
  const [customOrderInput, setCustomOrderInput] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [patientInstructions, setPatientInstructions] = useState(
    'Stay seated and breathe calmly. Paramedic Unit EMS-04 is en route with oxygen. Your Health Passport and allergies have been reviewed by our emergency physician.'
  );
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSuccessBanner, setReviewSuccessBanner] = useState<string | null>(null);
  const [radioTransmitting, setRadioTransmitting] = useState(false);

  // Load events
  const loadEvents = async () => {
    setLoading(true);
    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { data, error } = await supabase
            .from('sos_events')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;
          
          const eventsWithPassports = await Promise.all((data || []).map(async (event) => {
            const { data: passport } = await supabase
              .from('health_passports')
              .select('*')
              .eq('user_id', event.user_id)
              .single();

            return {
              ...event,
              patient_name: passport?.full_name || 'Anonymous Patient',
              patient_passport: passport || undefined
            };
          }));

          setSosEvents(eventsWithPassports);
        } catch (err) {
          console.error('Error loading live SOS events:', err);
          fallbackToMockEvents();
        }
      }
    } else {
      fallbackToMockEvents();
    }
    setLoading(false);
  };

  const fallbackToMockEvents = () => {
    const events = mockDB.getSosEvents();
    const passports = mockDB.getPassports();
    
    const sorted = [...events].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    const hydrated = sorted.map(event => {
      const p = passports.find(pass => pass.user_id === event.user_id);
      return {
        ...event,
        patient_name: p?.full_name || event.patient_name || 'Anonymous Patient',
        patient_passport: p || undefined
      };
    });

    setSosEvents(hydrated);
  };

  // Load ambulance locations
  const loadAmbulanceLocations = () => {
    const locs = mockDB.getAmbulanceLocations();
    const map: { [id: string]: AmbulanceLocation } = {};
    locs.forEach(l => {
      map[l.sos_event_id] = l;
    });
    setAmbulanceLocations(map);
  };

  useEffect(() => {
    loadEvents();
    loadAmbulanceLocations();

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        const subscription = supabase
          .channel('dashboard_sos_events')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'sos_events' },
            () => {
              loadEvents();
              if (audioAlertsEnabled) {
                playEmergencyAlertSound('sos_dispatch');
              }
            }
          )
          .subscribe();

        const ambSubscription = supabase
          .channel('dashboard_ambulance_locs')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'ambulance_locations' },
            (payload) => {
              const newLoc = payload.new as AmbulanceLocation;
              if (newLoc?.sos_event_id) {
                setAmbulanceLocations(prev => ({
                  ...prev,
                  [newLoc.sos_event_id]: newLoc
                }));
              }
            }
          )
          .subscribe();

        return () => {
          supabase.removeChannel(subscription);
          supabase.removeChannel(ambSubscription);
        };
      }
    } else {
      const unsubscribe = realtimeEvents.on('sos_events_change', () => {
        fallbackToMockEvents();
      });

      const unsubAmbulance = realtimeEvents.on('ambulance_change', (locs: AmbulanceLocation[]) => {
        const map: { [id: string]: AmbulanceLocation } = {};
        locs.forEach(l => {
          map[l.sos_event_id] = l;
        });
        setAmbulanceLocations(map);
      });

      return () => {
        unsubscribe();
        unsubAmbulance();
      };
    }
  }, [isSupabaseLive, audioAlertsEnabled]);

  // Synchronize selected event detail
  useEffect(() => {
    if (!selectedEvent) return;
    const matched = sosEvents.find(e => e.id === selectedEvent.id);
    if (matched) {
      setSelectedEvent(matched);
      // If event has existing review, populate form
      if (matched.doctor_review) {
        setTriagePriority(matched.doctor_review.triage_priority);
        setAssignedHospital(matched.doctor_review.assigned_hospital);
        setSelectedOrders(matched.doctor_review.orders || []);
        setClinicalNotes(matched.doctor_review.clinical_notes || '');
        setPatientInstructions(matched.doctor_review.patient_instructions || '');
      } else {
        // Pre-fill smart defaults based on patient passport
        if (matched.patient_passport?.allergies.length) {
          const allergyText = matched.patient_passport.allergies.join(', ');
          setClinicalNotes(`CRITICAL: Patient reported severe allergy to: ${allergyText}. Avoid contraindications.`);
          setSelectedOrders(prev => [
            ...prev,
            `Severe Allergy Notice: Check ${allergyText} against meds`
          ]);
        }
      }
    }
  }, [sosEvents]);

  // Dispatch ambulance
  const handleDispatch = async (event: SosEvent) => {
    setUpdatingId(event.id);
    const updatedStatus: SosStatus = 'dispatched';

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          await supabase
            .from('sos_events')
            .update({ status: updatedStatus })
            .eq('id', event.id);

          await supabase.from('ambulance_locations').upsert({
            sos_event_id: event.id,
            latitude: event.latitude - 0.02,
            longitude: event.longitude - 0.02,
            updated_at: new Date().toISOString()
          });

          await loadEvents();
        } catch (err) {
          console.error('Error dispatching live ambulance:', err);
          dispatchMock(event.id, event.latitude, event.longitude);
        }
      }
    } else {
      dispatchMock(event.id, event.latitude, event.longitude);
    }
    setUpdatingId(null);
  };

  const dispatchMock = (id: string, lat: number, lng: number) => {
    const events = mockDB.getSosEvents();
    const updated = events.map(e => e.id === id ? { ...e, status: 'dispatched' as SosStatus } : e);
    mockDB.setSosEvents(updated);
    startAmbulanceSimulation(id, lat, lng);
    fallbackToMockEvents();
  };

  // Submit doctor review
  const handleSubmitReview = async () => {
    if (!selectedEvent) return;

    setIsSubmittingReview(true);
    const doctorName = 'Dr. Sarah Jenkins, MD';

    const review: DoctorReview = {
      doctor_id: userId,
      doctor_name: doctorName,
      doctor_specialty: 'Emergency Medicine & Critical Triage',
      reviewed_at: new Date().toISOString(),
      triage_priority: triagePriority,
      clinical_notes: clinicalNotes || 'Clinical records evaluated. Emergency resuscitation protocols active.',
      patient_instructions: patientInstructions,
      assigned_hospital: assignedHospital,
      doctor_status: 'orders_issued',
      orders: selectedOrders
    };

    try {
      await saveDoctorReview(selectedEvent.id, review);
      
      // Auto dispatch ambulance if still pending
      if (selectedEvent.status === 'pending') {
        await handleDispatch(selectedEvent);
      }

      // Play medical confirmation chime
      playEmergencyAlertSound('doctor_review');

      setReviewSuccessBanner(`Clinical orders transmitted. Patient ${selectedEvent.patient_name} notified instantly!`);
      setTimeout(() => {
        setReviewSuccessBanner(null);
      }, 5000);

    } catch (err) {
      console.error('Error submitting review:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Radio paramedic simulation
  const handleRadioParamedics = () => {
    setRadioTransmitting(true);
    playEmergencyAlertSound('sos_dispatch');
    setTimeout(() => {
      setRadioTransmitting(false);
    }, 2500);
  };

  // Filter events
  const filteredEvents = sosEvents.filter(e => {
    if (activeFilter === 'needs_review') return !e.doctor_review && e.status !== 'resolved';
    if (activeFilter === 'dispatched') return e.status === 'dispatched';
    if (activeFilter === 'reviewed') return !!e.doctor_review;
    if (activeFilter === 'resolved') return e.status === 'resolved';
    return true;
  });

  const needsReviewCount = sosEvents.filter(e => !e.doctor_review && e.status !== 'resolved').length;

  return (
    <div id="dashboard-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Clinician Command Header */}
      <div className="bg-gray-900 text-white p-5 rounded-b-3xl shadow-md border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-650 text-white rounded-2xl shadow-md">
              <Stethoscope size={20} className="animate-pulse" />
            </div>
            <div>
              <h2 className="font-sans font-extrabold text-white text-base tracking-tight leading-tight">
                Physician Response Command
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 flex items-center gap-1.5">
                <span>Dr. Sarah Jenkins</span>
                <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                <span className="text-emerald-400">ONLINE</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setAudioAlertsEnabled(!audioAlertsEnabled)}
              title={audioAlertsEnabled ? "Mute Alert Audio" : "Enable Alert Audio"}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                audioAlertsEnabled 
                  ? 'bg-gray-800 text-teal-400 border-gray-700' 
                  : 'bg-gray-800/50 text-gray-500 border-gray-800'
              }`}
            >
              {audioAlertsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>

            <button 
              onClick={loadEvents}
              title="Refresh Incident Streams"
              className="p-2 bg-gray-800 hover:bg-gray-750 text-white rounded-xl border border-gray-700 transition cursor-pointer"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Dynamic Interactive Filter Tabs */}
        <div className="flex gap-1.5 mt-4 overflow-x-auto pb-1 no-scrollbar text-[10px] font-bold uppercase tracking-wider">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeFilter === 'all' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-white bg-gray-850'
            }`}
          >
            All ({sosEvents.length})
          </button>
          <button
            onClick={() => setActiveFilter('needs_review')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
              activeFilter === 'needs_review' ? 'bg-red-650 text-white shadow-sm' : 'text-gray-400 hover:text-white bg-gray-850'
            }`}
          >
            <span>Needs Review</span>
            {needsReviewCount > 0 && (
              <span className="bg-white text-red-650 text-[9px] font-extrabold px-1.5 py-0.2 rounded-full">
                {needsReviewCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveFilter('reviewed')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeFilter === 'reviewed' ? 'bg-teal-700 text-white shadow-sm' : 'text-gray-400 hover:text-white bg-gray-850'
            }`}
          >
            Reviewed
          </button>
          <button
            onClick={() => setActiveFilter('dispatched')}
            className={`px-3 py-1.5 rounded-xl transition cursor-pointer whitespace-nowrap ${
              activeFilter === 'dispatched' ? 'bg-amber-600 text-white shadow-sm' : 'text-gray-400 hover:text-white bg-gray-850'
            }`}
          >
            En Route
          </button>
        </div>
      </div>

      {/* Main Command Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
        
        {reviewSuccessBanner && (
          <div className="bg-emerald-600 text-white p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-lg animate-bounce">
            <CheckCircle2 size={16} className="shrink-0" />
            <span>{reviewSuccessBanner}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-400">
            <RefreshCw className="animate-spin text-teal-600 mb-2" size={24} />
            <span className="text-xs font-semibold">Synchronizing emergency feeds...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center space-y-3 font-sans">
            <ShieldCheck className="text-teal-600 mx-auto" size={40} />
            <h3 className="font-sans font-extrabold text-gray-900 text-sm">No Incidents In This Category</h3>
            <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
              Sector telemetry is clear. All emergency dispatches have been triaged or are en route.
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const hasReview = !!event.doctor_review;
            const ambLoc = ambulanceLocations[event.id];

            return (
              <div
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className={`p-4 bg-white rounded-2xl border transition-all cursor-pointer shadow-sm relative overflow-hidden group hover:shadow-md ${
                  selectedEvent?.id === event.id 
                    ? 'border-red-650 ring-2 ring-red-650/30' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                {/* Visual side accent matching status */}
                <div className={`absolute top-0 bottom-0 left-0 w-1.5 ${
                  event.status === 'pending' ? 'bg-red-650' :
                  event.status === 'dispatched' ? 'bg-amber-500' : 'bg-teal-600'
                }`}></div>

                <div className="flex justify-between items-start pl-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-sans font-extrabold text-gray-900 text-sm tracking-tight">
                        {event.patient_name}
                      </h4>

                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md leading-none uppercase tracking-wider ${
                        event.status === 'pending' ? 'bg-red-50 text-red-650 border border-red-200' :
                        event.status === 'dispatched' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-teal-50 text-teal-800 border border-teal-200'
                      }`}>
                        {event.status}
                      </span>

                      {hasReview && (
                        <span className="text-[9px] font-bold bg-teal-600 text-white px-2 py-0.5 rounded-md uppercase tracking-wider flex items-center gap-1">
                          <Check size={10} /> Doctor Reviewed
                        </span>
                      )}
                    </div>

                    <p className="text-[10px] text-gray-400 flex items-center gap-1 font-mono">
                      <MapPin size={10} /> {event.latitude.toFixed(4)}, {event.longitude.toFixed(4)}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-gray-400 font-mono font-medium flex items-center justify-end gap-1">
                      <Clock size={10} />
                      {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {!hasReview && event.status !== 'resolved' && (
                      <span className="inline-block mt-1 text-[9px] font-extrabold text-red-650 uppercase tracking-wider animate-pulse">
                        ● Review Needed
                      </span>
                    )}
                  </div>
                </div>

                {/* Patient Health Passport quick indicators on list card */}
                {event.patient_passport && (
                  <div className="mt-3 pt-2.5 border-t border-gray-100 pl-2 flex gap-1.5 flex-wrap items-center">
                    <span className="text-[9px] bg-red-50 border border-red-200 text-red-700 font-bold px-2 py-0.5 rounded-lg">
                      BLOOD: {event.patient_passport.blood_type.replace('Positive', '+').replace('Negative', '-')}
                    </span>
                    {event.patient_passport.allergies.length > 0 && (
                      <span className="text-[9px] bg-amber-50 border border-amber-200 text-amber-800 font-bold px-2 py-0.5 rounded-lg uppercase">
                        {event.patient_passport.allergies[0]} {event.patient_passport.allergies.length > 1 ? `+${event.patient_passport.allergies.length - 1}` : ''}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] font-bold text-gray-400 group-hover:text-gray-900 flex items-center gap-0.5 transition">
                      Triage Case <ChevronRight size={12} />
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* COMPREHENSIVE INTERACTIVE CLINICIAN CASE FILE DRAWER */}
      {selectedEvent && (
        <div className="absolute inset-0 z-50 bg-gray-950/60 backdrop-blur-xs flex flex-col justify-end">
          
          {/* Backdrop Closer */}
          <div className="flex-1" onClick={() => setSelectedEvent(null)}></div>
          
          {/* Drawer Content */}
          <div className="bg-white rounded-t-3xl shadow-2xl border-t border-gray-200 p-5 space-y-4 max-h-[92%] overflow-y-auto max-w-md w-full mx-auto animate-slide-up font-sans">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-gray-150">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-50 text-red-650 rounded-xl">
                  <Stethoscope size={18} />
                </div>
                <div>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block leading-tight">
                    PHYSICIAN CLINICAL REVIEW DOSSIER
                  </span>
                  <h3 className="font-sans font-extrabold text-gray-900 text-base leading-tight">
                    {selectedEvent.patient_name}
                  </h3>
                </div>
              </div>

              <button 
                onClick={() => setSelectedEvent(null)}
                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-full transition cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* REAL GPS LIVE TRACKING MAP EMBEDDED IN DOCTOR VIEW */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-gray-900 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Navigation size={13} className="text-teal-600" />
                  <span>Real-Time Incident Map & Transit Route</span>
                </span>
                <span className="text-[9px] font-mono text-gray-400">
                  {selectedEvent.latitude.toFixed(4)}, {selectedEvent.longitude.toFixed(4)}
                </span>
              </div>

              <LiveGpsMap 
                patientLat={selectedEvent.latitude}
                patientLng={selectedEvent.longitude}
                patientName={selectedEvent.patient_name}
                ambulanceLocation={ambulanceLocations[selectedEvent.id] || null}
                className="h-52 rounded-2xl"
              />
            </div>

            {/* Interactive Paramedic Radio Communication Bar */}
            <div className="bg-gray-900 text-white p-3 rounded-2xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${radioTransmitting ? 'bg-red-650 animate-ping' : 'bg-gray-800 text-teal-400'}`}>
                  <Radio size={14} />
                </div>
                <div>
                  <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">PARAMEDIC COMMS</span>
                  <span className="text-xs font-bold text-white">Unit EMS-04 Direct Radio</span>
                </div>
              </div>

              <button
                onClick={handleRadioParamedics}
                disabled={radioTransmitting}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-750 text-teal-400 border border-teal-500/30 font-bold rounded-xl text-[10px] uppercase tracking-wider transition cursor-pointer"
              >
                {radioTransmitting ? 'Transmitting...' : 'Ping Paramedic'}
              </button>
            </div>

            {/* Emergency Medical Health Passport */}
            {selectedEvent.patient_passport && (
              <div className="bg-gray-50 p-4 rounded-2xl border border-gray-200/80 space-y-3">
                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-gray-800">
                    <FileText size={13} className="text-teal-600" />
                    Verified Patient Health Passport
                  </span>
                  <span className="text-red-650 font-extrabold">
                    {selectedEvent.patient_passport.blood_type.replace('Positive', '+').replace('Negative', '-')}
                  </span>
                </h4>

                {/* Allergies Highlight Alert */}
                {selectedEvent.patient_passport.allergies.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-xs flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[9px] font-extrabold text-amber-900 uppercase tracking-wider block">
                        Contraindication Alert
                      </span>
                      <p className="text-amber-800 font-medium text-[11px] leading-tight mt-0.5">
                        Patient has confirmed allergies to: <strong>{selectedEvent.patient_passport.allergies.join(', ')}</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* Chronic conditions & medications grid */}
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                    <span className="text-[9px] text-gray-400 font-bold uppercase block">Chronic History</span>
                    <span className="font-semibold text-gray-800 block mt-0.5">
                      {selectedEvent.patient_passport.chronic_conditions.join(', ') || 'None reported'}
                    </span>
                  </div>

                  <div className="bg-white p-2.5 rounded-xl border border-gray-200">
                    <span className="text-[9px] text-gray-400 font-bold uppercase block">Medications</span>
                    <span className="font-semibold text-gray-800 block mt-0.5">
                      {selectedEvent.patient_passport.medications.join(', ') || 'None reported'}
                    </span>
                  </div>
                </div>

                {/* Contacts dial */}
                {selectedEvent.patient_passport.emergency_contacts[0] && (
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-gray-200/60">
                    <span className="text-gray-500 font-medium text-[10px]">
                      Contact: {selectedEvent.patient_passport.emergency_contacts[0].name} ({selectedEvent.patient_passport.emergency_contacts[0].relation})
                    </span>
                    <a 
                      href={`tel:${selectedEvent.patient_passport.emergency_contacts[0].phone}`}
                      className="text-red-650 hover:underline font-bold text-[10px] flex items-center gap-1"
                    >
                      <Phone size={10} /> Call Next of Kin
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* DOCTOR CLINICAL REVIEW & TRIAGE CONSOLE */}
            <div className="bg-white p-4 rounded-2xl border-2 border-teal-600/30 shadow-sm space-y-3.5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <div className="flex items-center gap-2">
                  <ClipboardCheck size={16} className="text-teal-700" />
                  <span className="font-sans font-extrabold text-gray-900 text-xs uppercase tracking-wider">
                    Physician Triage & Directives
                  </span>
                </div>
                {selectedEvent.doctor_review && (
                  <span className="text-[9px] font-extrabold bg-teal-50 text-teal-800 px-2 py-0.5 rounded-md border border-teal-200">
                    REVIEW TRANSMITTED
                  </span>
                )}
              </div>

              {/* Triage Priority Selector */}
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Triage Priority Level
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setTriagePriority('critical')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      triagePriority === 'critical'
                        ? 'bg-red-650 text-white border-red-650 shadow-sm'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Code Red (Critical)
                  </button>

                  <button
                    type="button"
                    onClick={() => setTriagePriority('urgent')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      triagePriority === 'urgent'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Code Amber (Urgent)
                  </button>

                  <button
                    type="button"
                    onClick={() => setTriagePriority('moderate')}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                      triagePriority === 'moderate'
                        ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    Code Green (Stable)
                  </button>
                </div>
              </div>

              {/* Receiving Hospital Facility */}
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                  Designated Receiving Hospital Facility
                </label>
                <select
                  value={assignedHospital}
                  onChange={(e) => setAssignedHospital(e.target.value)}
                  className="w-full text-xs font-medium p-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600"
                >
                  {PRESET_HOSPITALS.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Clinical Orders Chips */}
              <div>
                <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                  Pre-Arrival Directives to Ambulance Crew
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PRESET_CLINICAL_ORDERS.map(order => {
                    const isSelected = selectedOrders.includes(order);
                    return (
                      <button
                        key={order}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedOrders(selectedOrders.filter(o => o !== order));
                          } else {
                            setSelectedOrders([...selectedOrders, order]);
                          }
                        }}
                        className={`text-[10px] font-bold px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
                          isSelected
                            ? 'bg-gray-900 text-white border-gray-900 shadow-xs'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {isSelected ? '✓ ' : '+ '} {order}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Personalized Instructions to Patient */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[9px] font-bold text-gray-400 uppercase tracking-wider block">
                    Specialist Advisory Transmitted to Patient
                  </label>
                  <span className="text-[9px] text-teal-700 font-extrabold">Notifies Patient Immediately</span>
                </div>
                <textarea
                  value={patientInstructions}
                  onChange={(e) => setPatientInstructions(e.target.value)}
                  rows={2}
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-teal-600 leading-relaxed font-sans"
                  placeholder="Type reassuring clinical guidance for the patient..."
                />
              </div>

              {/* Submit Review Button */}
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={isSubmittingReview}
                className="w-full py-3.5 bg-teal-700 hover:bg-teal-800 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send size={14} />
                <span>
                  {isSubmittingReview 
                    ? 'Broadcasting Review...' 
                    : selectedEvent.doctor_review 
                    ? 'Update Review & Alert Patient' 
                    : 'Submit Clinical Review & Alert Patient'}
                </span>
              </button>
            </div>

            {/* Quick Dispatch / Resolve status buttons */}
            <div className="pt-2 border-t border-gray-150 flex gap-2">
              {selectedEvent.status === 'pending' && (
                <button
                  onClick={() => handleDispatch(selectedEvent)}
                  disabled={updatingId === selectedEvent.id}
                  className="flex-1 py-3 bg-red-650 hover:bg-red-700 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Ambulance size={14} />
                  <span>Dispatch Response Unit</span>
                </button>
              )}

              {selectedEvent.status === 'dispatched' && (
                <button
                  onClick={async () => {
                    setUpdatingId(selectedEvent.id);
                    const updatedStatus: SosStatus = 'resolved';
                    if (isSupabaseLive) {
                      const supabase = getSupabase();
                      if (supabase) {
                        await supabase
                          .from('sos_events')
                          .update({ status: updatedStatus, resolved_at: new Date().toISOString() })
                          .eq('id', selectedEvent.id);
                      }
                    }
                    stopAmbulanceSimulation(selectedEvent.id);
                    const events = mockDB.getSosEvents();
                    const updated = events.map(e => e.id === selectedEvent.id ? { 
                      ...e, 
                      status: updatedStatus, 
                      resolved_at: new Date().toISOString() 
                    } : e);
                    mockDB.setSosEvents(updated);
                    fallbackToMockEvents();
                    setUpdatingId(null);
                  }}
                  disabled={updatingId === selectedEvent.id}
                  className="flex-1 py-3 bg-gray-900 hover:bg-gray-850 text-white font-bold rounded-xl text-xs uppercase tracking-wider transition shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 size={14} />
                  <span>Mark Incident Resolved</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
