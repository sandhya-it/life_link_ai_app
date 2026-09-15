import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { UserRole, HealthPassport, SosEvent, AmbulanceLocation, SosStatus, EmergencyContact } from '../types';

// Storage keys
const SUPABASE_URL_KEY = 'lifelink_supabase_url';
const SUPABASE_KEY_KEY = 'lifelink_supabase_key';

// Helper to get connection configuration
export function getSupabaseCredentials() {
  const url = localStorage.getItem(SUPABASE_URL_KEY);
  const key = localStorage.getItem(SUPABASE_KEY_KEY);
  return url && key ? { url, key } : null;
}

export function saveSupabaseCredentials(url: string, key: string) {
  localStorage.setItem(SUPABASE_URL_KEY, url.trim());
  localStorage.setItem(SUPABASE_KEY_KEY, key.trim());
  // Reload the client
  initializeSupabase();
}

export function clearSupabaseCredentials() {
  localStorage.removeItem(SUPABASE_URL_KEY);
  localStorage.removeItem(SUPABASE_KEY_KEY);
  supabaseInstance = null;
}

let supabaseInstance: SupabaseClient | null = null;

function initializeSupabase() {
  const creds = getSupabaseCredentials();
  if (creds) {
    try {
      supabaseInstance = createClient(creds.url, creds.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        }
      });
      console.log('Supabase initialized successfully with credentials.');
    } catch (err) {
      console.error('Failed to initialize Supabase client:', err);
      supabaseInstance = null;
    }
  } else {
    supabaseInstance = null;
  }
}

// Initial build
initializeSupabase();

export function getSupabase(): SupabaseClient | null {
  return supabaseInstance;
}

// ==========================================
// MOCK FALLBACK DATABASE & STATE ENGINE
// ==========================================

export interface MockUser {
  id: string;
  email: string;
  role: UserRole;
  full_name: string;
  password?: string;
}

// Seed initial mock accounts if not present
const INITIAL_MOCK_USERS: MockUser[] = [
  { id: 'usr-1', email: 'patient@lifelink.ai', role: 'patient', full_name: 'Alex Mercer', password: 'password123' },
  { id: 'usr-2', email: 'doctor@lifelink.ai', role: 'doctor', full_name: 'Dr. Sarah Jenkins', password: 'password123' },
  { id: 'usr-3', email: 'hospital@lifelink.ai', role: 'hospital', full_name: 'Metro City Hospital Staff', password: 'password123' },
  { id: 'usr-4', email: 'dispatcher@lifelink.ai', role: 'dispatcher', full_name: 'Central 911 Dispatcher', password: 'password123' },
];

const INITIAL_MOCK_PASSPORTS: HealthPassport[] = [
  {
    user_id: 'usr-1',
    full_name: 'Alex Mercer',
    blood_type: 'O-Negative',
    allergies: ['Penicillin', 'Peanuts', 'Bee Stings'],
    chronic_conditions: ['Asthma', 'Type 1 Diabetes'],
    medications: ['Insulin Glargine', 'Albuterol Inhaler'],
    emergency_contacts: [
      { name: 'Helen Mercer', phone: '+1 (555) 019-2834', relation: 'Spouse' },
      { name: 'Robert Mercer', phone: '+1 (555) 014-9922', relation: 'Father' }
    ]
  }
];

// Helper to initialize local storage
function getStored<T>(key: string, fallback: T): T {
  const data = localStorage.getItem(key);
  if (!data) {
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  }
  try {
    return JSON.parse(data);
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Set up databases
export const mockDB = {
  getUsers: () => getStored<MockUser[]>('lifelink_db_users', INITIAL_MOCK_USERS),
  setUsers: (users: MockUser[]) => setStored('lifelink_db_users', users),
  
  getPassports: () => getStored<HealthPassport[]>('lifelink_db_passports', INITIAL_MOCK_PASSPORTS),
  setPassports: (p: HealthPassport[]) => setStored('lifelink_db_passports', p),
  
  getSosEvents: () => getStored<SosEvent[]>('lifelink_db_sos_events', []),
  setSosEvents: (events: SosEvent[]) => {
    setStored('lifelink_db_sos_events', events);
    // Notify active real-time subscribers
    realtimeEvents.emit('sos_events_change', events);
  },
  
  getAmbulanceLocations: () => getStored<AmbulanceLocation[]>('lifelink_db_ambulances', []),
  setAmbulanceLocations: (locs: AmbulanceLocation[]) => {
    setStored('lifelink_db_ambulances', locs);
    // Notify active real-time subscribers
    realtimeEvents.emit('ambulance_change', locs);
  }
};

// Simple event emitter for mock real-time updates
class RealtimeEventEmitter {
  private listeners: { [event: string]: Function[] } = {};

  on(event: string, callback: Function) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event: string, callback: Function) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event: string, data: any) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(data);
      } catch (err) {
        console.error('Error in real-time subscriber:', err);
      }
    });
  }
}

export const realtimeEvents = new RealtimeEventEmitter();

// CURRENT MOCK SESSION
export function getMockSessionUser(): MockUser | null {
  const stored = localStorage.getItem('lifelink_session_user');
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function setMockSessionUser(user: MockUser | null) {
  if (user) {
    localStorage.setItem('lifelink_session_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('lifelink_session_user');
  }
}

// Active simulation intervals tracking
let simulationIntervals: { [eventId: string]: NodeJS.Timeout } = {};

export function startAmbulanceSimulation(eventId: string, initialLat: number, initialLng: number) {
  if (simulationIntervals[eventId]) {
    clearInterval(simulationIntervals[eventId]);
  }

  // Target hospital is slightly offset (e.g., Metro City Hospital coordinates)
  const targetLat = initialLat + 0.015;
  const targetLng = initialLng + 0.015;

  // Ambulance starts far and drives toward the patient
  let currentLat = initialLat - 0.025;
  let currentLng = initialLng - 0.025;
  let steps = 0;

  const interval = setInterval(() => {
    const locs = mockDB.getAmbulanceLocations();
    
    // Simulate progression
    // Step 0-10: Ambulance moving towards patient
    // Step 11+: Ambulance arriving, picking up, moving to hospital
    if (steps < 10) {
      currentLat += (initialLat - currentLat) * 0.25;
      currentLng += (initialLng - currentLng) * 0.25;
    } else {
      // Arrived at patient, now heading to hospital
      currentLat += (targetLat - currentLat) * 0.15;
      currentLng += (targetLng - currentLng) * 0.15;
    }

    const updatedLoc: AmbulanceLocation = {
      id: `amb-${eventId}`,
      sos_event_id: eventId,
      latitude: Number(currentLat.toFixed(6)),
      longitude: Number(currentLng.toFixed(6)),
      updated_at: new Date().toISOString()
    };

    const cleanLocs = locs.filter(l => l.sos_event_id !== eventId);
    cleanLocs.push(updatedLoc);
    mockDB.setAmbulanceLocations(cleanLocs);

    // Also auto-update mock event status timeline to simulate a dispatcher/paramedic actions
    const events = mockDB.getSosEvents();
    const event = events.find(e => e.id === eventId);
    if (event && event.status !== 'resolved') {
      let statusUpdated = false;
      if (steps === 2 && event.status === 'pending') {
        event.status = 'dispatched';
        statusUpdated = true;
      }
      
      if (statusUpdated) {
        mockDB.setSosEvents([...events]);
      }
    }

    steps++;
  }, 4000);

  simulationIntervals[eventId] = interval;
}

export function stopAmbulanceSimulation(eventId: string) {
  if (simulationIntervals[eventId]) {
    clearInterval(simulationIntervals[eventId]);
    delete simulationIntervals[eventId];
  }
}

// Medical Alert Audio Chime using Web Audio API
export function playEmergencyAlertSound(type: 'doctor_review' | 'sos_dispatch' = 'doctor_review') {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    if (type === 'doctor_review') {
      // Pleasant, clear two-tone chime for doctor review (A5 -> D6)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.15); // D6
      gain2.gain.setValueAtTime(0.2, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.65);
    } else {
      // Rapid dual alert beep for high priority
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(750, now);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  } catch (err) {
    console.warn('Audio chime notice error:', err);
  }
}

// Function to save and broadcast doctor's review of a case
export async function saveDoctorReview(eventId: string, review: import('../types').DoctorReview) {
  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('sos_events')
        .update({
          doctor_review: review,
        })
        .eq('id', eventId);
    } catch (err) {
      console.warn('Live save doctor review error:', err);
    }
  }

  // Update in mockDB
  const events = mockDB.getSosEvents();
  const updated = events.map(e => e.id === eventId ? {
    ...e,
    doctor_review: review
  } : e);
  mockDB.setSosEvents(updated);

  // Emit specialized doctor_reviewed event
  realtimeEvents.emit('doctor_reviewed', { eventId, review });
}
