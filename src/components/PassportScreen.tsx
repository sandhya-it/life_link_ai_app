import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import { getSupabase, mockDB } from '../lib/supabase';
import { HealthPassport, EmergencyContact } from '../types';
import { 
  Heart, ShieldAlert, Award, Plus, Trash2, Save, 
  Eye, FileText, CheckCircle2, User, Phone, Users, X, RefreshCw,
  QrCode, Download, Maximize2, Copy, Check, ExternalLink, ShieldCheck, Sparkles
} from 'lucide-react';

interface PassportScreenProps {
  userId: string;
  isSupabaseLive: boolean;
  appLanguage: 'en' | 'ta' | 'hi';
}

export default function PassportScreen({ userId, isSupabaseLive, appLanguage }: PassportScreenProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'card'>('edit');
  
  // Form States
  const [fullName, setFullName] = useState('');
  const [bloodType, setBloodType] = useState('O-Positive');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [chronicConditions, setChronicConditions] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);

  // Input states for tag boxes
  const [allergyInput, setAllergyInput] = useState('');
  const [conditionInput, setConditionInput] = useState('');
  const [medInput, setMedInput] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Working QR Code States
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [qrFormat, setQrFormat] = useState<'vitals' | 'url'>('vitals');
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showDecodedPreview, setShowDecodedPreview] = useState(true);

  // Compute standard payload for QR code
  const emergencyVitalsText = useMemo(() => {
    const bloodFormatted = bloodType.replace('Positive', '+').replace('Negative', '-');
    const allergiesText = allergies.length > 0 ? allergies.join(', ') : 'None Declared';
    const conditionsText = chronicConditions.length > 0 ? chronicConditions.join(', ') : 'None Declared';
    const medsText = medications.length > 0 ? medications.join(', ') : 'None Declared';
    const primaryContact = emergencyContacts[0] 
      ? `${emergencyContacts[0].name} (${emergencyContacts[0].relation}): ${emergencyContacts[0].phone}`
      : 'None Specified';

    return [
      `🚨 LIFELINK EMERGENCY MEDICAL ID`,
      `PATIENT: ${fullName || 'Alex Mercer'}`,
      `BLOOD TYPE: ${bloodFormatted}`,
      `ALLERGIES: ${allergiesText}`,
      `CONDITIONS: ${conditionsText}`,
      `MEDICATIONS: ${medsText}`,
      `ICE CONTACT: ${primaryContact}`,
      `RECORD REF: LL-${userId ? userId.substring(0, 8).toUpperCase() : 'SECURE'}`,
      `VERIFIED BY: LifeLink AI Triage Network`
    ].join('\n');
  }, [fullName, bloodType, allergies, chronicConditions, medications, emergencyContacts, userId]);

  const emergencyUrl = useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://lifelink.ai';
    return `${origin}/#emergency-id?id=${encodeURIComponent(userId)}&name=${encodeURIComponent(fullName || 'Alex Mercer')}&blood=${encodeURIComponent(bloodType)}`;
  }, [userId, fullName, bloodType]);

  // Generate real scannable QR Code image with qrcode library
  useEffect(() => {
    const payload = qrFormat === 'vitals' ? emergencyVitalsText : emergencyUrl;
    QRCode.toDataURL(payload, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#090d16',
        light: '#ffffff'
      }
    })
      .then((url: string) => {
        setQrCodeDataUrl(url);
      })
      .catch((err: any) => {
        console.error('Error generating emergency QR code:', err);
      });
  }, [emergencyVitalsText, emergencyUrl, qrFormat]);

  // Download QR Code image
  const handleDownloadQR = () => {
    if (!qrCodeDataUrl) return;
    setDownloading(true);
    const link = document.createElement('a');
    link.href = qrCodeDataUrl;
    link.download = `lifelink-emergency-qr-${(fullName || 'patient').toLowerCase().replace(/\s+/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => setDownloading(false), 1000);
  };

  // Copy raw payload text
  const handleCopyPayload = () => {
    const payload = qrFormat === 'vitals' ? emergencyVitalsText : emergencyUrl;
    navigator.clipboard.writeText(payload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Load health passport data
  useEffect(() => {
    async function loadPassport() {
      setLoading(true);
      if (isSupabaseLive) {
        const supabase = getSupabase();
        if (supabase) {
          try {
            const { data, error } = await supabase
              .from('health_passports')
              .select('*')
              .eq('user_id', userId)
              .single();

            if (error && error.code !== 'PGRST116') {
              throw error;
            }

            if (data) {
              setFullName(data.full_name || '');
              setBloodType(data.blood_type || 'O-Positive');
              setAllergies(data.allergies || []);
              setChronicConditions(data.chronic_conditions || []);
              setMedications(data.medications || []);
              setEmergencyContacts(data.emergency_contacts || []);
            }
          } catch (err) {
            console.error('Error loading live passport:', err);
          }
        }
      } else {
        // Mock DB load
        const passports = mockDB.getPassports();
        const userPassport = passports.find(p => p.user_id === userId);
        if (userPassport) {
          setFullName(userPassport.full_name);
          setBloodType(userPassport.blood_type);
          setAllergies(userPassport.allergies);
          setChronicConditions(userPassport.chronic_conditions);
          setMedications(userPassport.medications);
          setEmergencyContacts(userPassport.emergency_contacts);
        }
      }
      setLoading(false);
    }
    loadPassport();
  }, [userId, isSupabaseLive]);

  // Handle adding tags on enter or click
  const handleAddTag = (
    input: string, 
    setInput: React.Dispatch<React.SetStateAction<string>>, 
    tags: string[], 
    setTags: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (input.trim() && !tags.includes(input.trim())) {
      setTags([...tags, input.trim()]);
      setInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string, tags: string[], setTags: React.Dispatch<React.SetStateAction<string[]>>) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // repeatable contacts managers
  const handleAddContact = () => {
    setEmergencyContacts([...emergencyContacts, { name: '', phone: '', relation: 'Spouse' }]);
  };

  const handleUpdateContact = (index: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...emergencyContacts];
    updated[index] = { ...updated[index], [field]: value };
    setEmergencyContacts(updated);
  };

  const handleRemoveContact = (index: number) => {
    setEmergencyContacts(emergencyContacts.filter((_, i) => i !== index));
  };

  // Saving data
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    const updatedPassport: HealthPassport = {
      user_id: userId,
      full_name: fullName || 'User Name',
      blood_type: bloodType,
      allergies,
      chronic_conditions: chronicConditions,
      medications,
      emergency_contacts: emergencyContacts
    };

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (supabase) {
        try {
          const { error } = await supabase
            .from('health_passports')
            .upsert(updatedPassport);

          if (error) throw error;
          setFeedback('Health Passport updated successfully on Supabase.');
        } catch (err: any) {
          console.error('Error saving live passport:', err);
          setFeedback(`Live Save failed: ${err.message}. Saving to sandbox fallback.`);
          saveToMockDB(updatedPassport);
        }
      }
    } else {
      saveToMockDB(updatedPassport);
      setFeedback('Passport saved securely in local Sandbox DB.');
    }

    setSaving(false);
    // Auto-clear feedback banner after 4 seconds
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const saveToMockDB = (updatedPassport: HealthPassport) => {
    const passports = mockDB.getPassports();
    const index = passports.findIndex(p => p.user_id === userId);
    if (index >= 0) {
      passports[index] = updatedPassport;
    } else {
      passports.push(updatedPassport);
    }
    mockDB.setPassports(passports);
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500">
        <RefreshCw className="animate-spin text-teal-600 mb-2" size={24} />
        <span>Loading Passport Records...</span>
      </div>
    );
  }

  return (
    <div id="passport-view-wrapper" className="flex flex-col flex-1 h-full max-w-md mx-auto bg-gray-50 relative pb-20 font-sans">
      
      {/* Tab Selectors */}
      <div className="px-6 pt-5 bg-white border-b border-gray-200 flex gap-6">
        <button
          onClick={() => setActiveTab('edit')}
          className={`flex items-center gap-2 pb-3 font-sans font-bold text-xs uppercase tracking-widest border-b-2 transition ${
            activeTab === 'edit' ? 'border-teal-600 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <FileText size={15} />
          <span>Edit Records</span>
        </button>
        <button
          onClick={() => setActiveTab('card')}
          className={`flex items-center gap-2 pb-3 font-sans font-bold text-xs uppercase tracking-widest border-b-2 transition ${
            activeTab === 'card' ? 'border-teal-600 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'
          }`}
        >
          <Award size={15} />
          <span>Emergency Card</span>
        </button>
      </div>

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {feedback && (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2.5 shadow-sm animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {/* TAB 1: EDIT FORM */}
        {activeTab === 'edit' && (
          <form onSubmit={handleSave} className="space-y-5 pb-6">
            
            {/* Full Name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Patient Full Name</label>
              <div className="relative">
                <User className="absolute left-3.5 top-3.5 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Enter your full legal name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-sm pl-11 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white transition"
                  required
                />
              </div>
            </div>

            {/* Blood Type Selector */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Blood Group</label>
                <select
                  value={bloodType}
                  onChange={(e) => setBloodType(e.target.value)}
                  className="w-full text-sm px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white transition cursor-pointer"
                >
                  <option value="A-Positive">A+</option>
                  <option value="A-Negative">A-</option>
                  <option value="B-Positive">B+</option>
                  <option value="B-Negative">B-</option>
                  <option value="AB-Positive">AB+</option>
                  <option value="AB-Negative">AB-</option>
                  <option value="O-Positive">O+</option>
                  <option value="O-Negative">O-</option>
                </select>
              </div>
              
              <div className="bg-teal-50/50 border border-teal-100 p-3 rounded-xl flex gap-2 items-center text-[10px] text-teal-800 leading-normal">
                <Heart size={18} className="text-teal-600 shrink-0 fill-teal-100" />
                <span>Accurate blood credentials help paramedics prepare for blood transfusion immediately.</span>
              </div>
            </div>

            {/* Allergies Box */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Allergies (e.g. Penicillin, Peanuts)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type an allergy and press Enter"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(allergyInput, setAllergyInput, allergies, setAllergies);
                    }
                  }}
                  className="w-full text-sm px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag(allergyInput, setAllergyInput, allergies, setAllergies)}
                  className="p-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition cursor-pointer"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {allergies.length === 0 ? (
                  <span className="text-xs text-gray-400 italic">No allergies declared.</span>
                ) : (
                  allergies.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 bg-red-50 border border-red-100 text-red-700 text-xs px-2.5 py-1 rounded-lg font-medium">
                      <span>{t}</span>
                      <button type="button" onClick={() => handleRemoveTag(t, allergies, setAllergies)} className="text-red-400 hover:text-red-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Chronic Conditions Box */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Chronic Conditions (e.g. Asthma, Diabetes)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type medical condition and press Enter"
                  value={conditionInput}
                  onChange={(e) => setConditionInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(conditionInput, setConditionInput, chronicConditions, setChronicConditions);
                    }
                  }}
                  className="w-full text-sm px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag(conditionInput, setConditionInput, chronicConditions, setChronicConditions)}
                  className="p-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition cursor-pointer"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {chronicConditions.length === 0 ? (
                  <span className="text-xs text-gray-400 italic">No chronic conditions declared.</span>
                ) : (
                  chronicConditions.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 text-gray-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                      <span>{t}</span>
                      <button type="button" onClick={() => handleRemoveTag(t, chronicConditions, setChronicConditions)} className="text-gray-400 hover:text-gray-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Current Medications */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Current Medications (e.g. Insulin, Albuterol)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Type medication and press Enter"
                  value={medInput}
                  onChange={(e) => setMedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag(medInput, setMedInput, medications, setMedications);
                    }
                  }}
                  className="w-full text-sm px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => handleAddTag(medInput, setMedInput, medications, setMedications)}
                  className="p-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition cursor-pointer"
                >
                  <Plus size={18} />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {medications.length === 0 ? (
                  <span className="text-xs text-gray-400 italic">No medications declared.</span>
                ) : (
                  medications.map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 bg-gray-100 border border-gray-200 text-gray-800 text-xs px-2.5 py-1 rounded-lg font-medium">
                      <span>{t}</span>
                      <button type="button" onClick={() => handleRemoveTag(t, medications, setMedications)} className="text-gray-400 hover:text-gray-600">
                        <X size={12} />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Emergency Contacts Repeatable List */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Emergency Contacts</label>
                <button
                  type="button"
                  onClick={handleAddContact}
                  className="text-xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 bg-teal-50 px-2.5 py-1.5 rounded-lg transition border border-teal-100/50"
                >
                  <Plus size={14} />
                  <span>Add Contact</span>
                </button>
              </div>

              {emergencyContacts.length === 0 ? (
                <div className="p-4 bg-gray-100 rounded-xl border border-gray-200 text-center text-xs text-gray-400 italic">
                  No emergency contacts configured yet. Paramedics cannot call anyone.
                </div>
              ) : (
                <div className="space-y-3">
                  {emergencyContacts.map((contact, index) => (
                    <div key={index} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3 relative">
                      <button
                        type="button"
                        onClick={() => handleRemoveContact(index)}
                        className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 size={15} />
                      </button>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Name</label>
                          <input
                            type="text"
                            placeholder="Full Name"
                            value={contact.name}
                            onChange={(e) => handleUpdateContact(index, 'name', e.target.value)}
                            className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                            required
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-gray-400 uppercase">Relation</label>
                          <select
                            value={contact.relation}
                            onChange={(e) => handleUpdateContact(index, 'relation', e.target.value)}
                            className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white cursor-pointer"
                          >
                            <option value="Spouse">Spouse</option>
                            <option value="Father">Father</option>
                            <option value="Mother">Mother</option>
                            <option value="Sibling">Sibling</option>
                            <option value="Friend">Friend</option>
                            <option value="Guardian">Guardian</option>
                            <option value="Doctor">Primary Care Physician</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">Phone Number</label>
                        <input
                          type="tel"
                          placeholder="+1 (555) 000-0000"
                          value={contact.phone}
                          onChange={(e) => handleUpdateContact(index, 'phone', e.target.value)}
                          className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-1 focus:ring-teal-600 bg-white"
                          required
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl transition shadow-sm disabled:opacity-75 flex items-center justify-center gap-2 mt-4 cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="animate-spin" size={18} />
              ) : (
                <>
                  <Save size={18} />
                  <span>Save Health Passport</span>
                </>
              )}
            </button>

          </form>
        )}

        {/* TAB 2: EMERGENCY CARD VIEW */}
        {activeTab === 'card' && (
          <div className="space-y-5 pb-6">
            
            {/* The Digital ID Card container */}
            <div className="bg-gray-950 rounded-2xl text-white overflow-hidden shadow-sm relative border border-gray-800 font-sans">
              
              {/* Geometric modern warning stripes decoration */}
              <div className="absolute top-0 right-0 w-28 h-28 bg-red-600/10 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-teal-500/5 rounded-full blur-2xl"></div>

              {/* ID Card Header */}
              <div className="bg-red-600 px-5 py-3.5 flex justify-between items-center border-b border-red-700">
                <div className="flex items-center gap-2">
                  <div className="bg-white p-1 rounded-md text-red-600">
                    <ShieldAlert size={15} className="fill-red-600 stroke-white" />
                  </div>
                  <span className="font-sans font-black text-xs tracking-widest text-white uppercase">EMERGENCY MEDICAL ID</span>
                </div>
                
                <button
                  type="button"
                  onClick={() => setIsEnlarged(true)}
                  className="flex items-center gap-1.5 text-[9px] font-mono bg-red-800/90 hover:bg-red-900 text-white font-bold px-2 py-1 rounded transition cursor-pointer border border-red-500/30"
                >
                  <QrCode size={11} className="text-white" />
                  <span>VIEW QR</span>
                </button>
              </div>

              {/* Patient Core Credentials */}
              <div className="p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Patient Name</p>
                    <h3 className="text-lg font-sans font-bold text-white mt-0.5">{fullName || 'Alex Mercer'}</h3>
                  </div>
                  <div className="text-right flex items-center gap-3">
                    {qrCodeDataUrl && (
                      <button
                        type="button"
                        onClick={() => setIsEnlarged(true)}
                        title="Click to enlarge QR code for scanning"
                        className="bg-white p-1 rounded-lg shadow-sm border border-gray-200 hover:scale-105 transition cursor-pointer"
                      >
                        <img src={qrCodeDataUrl} alt="Quick QR" className="w-9 h-9" />
                      </button>
                    )}
                    <div>
                      <p className="text-[9px] uppercase font-bold text-gray-500 tracking-wider">Blood Type</p>
                      <span className="text-lg font-sans font-black text-red-500 mt-0.5 block">
                        {bloodType.split('-')[0]}{bloodType.includes('Positive') ? '+' : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Grid of Medical Indicators */}
                <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-3">
                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block tracking-wider">ALLERGIES</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {allergies.length === 0 ? (
                        <span className="text-xs text-gray-600 italic">None reported</span>
                      ) : (
                        allergies.map(t => (
                          <span key={t} className="text-[9px] bg-red-950/80 text-red-400 border border-red-900/40 font-bold px-1.5 py-0.5 rounded leading-none block uppercase">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[9px] text-gray-500 uppercase font-bold block tracking-wider">CONDITIONS</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {chronicConditions.length === 0 ? (
                        <span className="text-xs text-gray-600 italic">None reported</span>
                      ) : (
                        chronicConditions.map(t => (
                          <span key={t} className="text-[9px] bg-amber-950/80 text-amber-400 border border-amber-900/40 font-bold px-1.5 py-0.5 rounded leading-none block uppercase">
                            {t}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Medications section */}
                <div className="border-t border-gray-800 pt-3">
                  <span className="text-[9px] text-gray-500 uppercase font-bold block tracking-wider">ACTIVE MEDICATIONS</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {medications.length === 0 ? (
                      <span className="text-xs text-gray-600 italic">None reported</span>
                    ) : (
                      medications.map(t => (
                        <span key={t} className="text-[9px] bg-gray-900 text-gray-300 border border-gray-800 font-bold px-1.5 py-0.5 rounded leading-none block uppercase">
                          {t}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Emergency contact row */}
                {emergencyContacts.length > 0 && (
                  <div className="border-t border-gray-800 pt-3 flex justify-between items-center">
                    <div>
                      <span className="text-[9px] text-gray-500 uppercase font-bold block tracking-wider">EMERGENCY CONTACT</span>
                      <p className="text-xs font-semibold text-gray-200 mt-0.5">
                        {emergencyContacts[0].name} ({emergencyContacts[0].relation})
                      </p>
                    </div>
                    <a 
                      href={`tel:${emergencyContacts[0].phone}`} 
                      className="p-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                    >
                      <Phone size={14} />
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Paramedic Scannable Working QR Code section */}
            <div className="bg-white p-5 rounded-2xl border border-gray-200/90 shadow-sm space-y-4 font-sans text-center">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-teal-50 border border-teal-200/70 text-teal-800 text-[10px] font-bold uppercase tracking-wider mb-2">
                  <ShieldCheck size={13} className="text-teal-600" />
                  <span>Live Verified QR Engine</span>
                </div>
                <h4 className="font-sans font-bold text-gray-900 text-base">Paramedic Emergency QR Code</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto leading-relaxed">
                  Scan this code with any smartphone camera or Google Lens to instantly retrieve patient vitals, blood group, allergies, and ICE contacts without unlocking the device.
                </p>
              </div>

              {/* Format Switcher */}
              <div className="inline-flex bg-gray-100 p-1 rounded-xl border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setQrFormat('vitals')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                    qrFormat === 'vitals'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Medical Vitals (Offline Scan)
                </button>
                <button
                  type="button"
                  onClick={() => setQrFormat('url')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-[11px] transition cursor-pointer ${
                    qrFormat === 'url'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  Web Dossier URL
                </button>
              </div>

              {/* Working QR Code Image Display */}
              <div className="bg-gray-50 p-4 rounded-2xl inline-block border border-gray-200 shadow-inner relative group">
                {qrCodeDataUrl ? (
                  <div className="relative">
                    <img 
                      src={qrCodeDataUrl} 
                      alt="Scannable Emergency Medical QR Code" 
                      className="w-48 h-48 mx-auto rounded-lg bg-white p-2 border border-gray-200 shadow-sm cursor-pointer transition hover:scale-[1.02]"
                      onClick={() => setIsEnlarged(true)}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/30 rounded-lg pointer-events-none">
                      <span className="bg-white text-gray-900 text-[10px] font-bold px-2 py-1 rounded shadow flex items-center gap-1">
                        <Maximize2 size={12} /> Tap to Enlarge
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-white rounded-lg">
                    <RefreshCw className="animate-spin text-teal-600" size={24} />
                  </div>
                )}
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsEnlarged(true)}
                  className="px-3.5 py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Maximize2 size={13} />
                  <span>Enlarge for Scanning</span>
                </button>

                <button
                  type="button"
                  onClick={handleDownloadQR}
                  disabled={downloading || !qrCodeDataUrl}
                  className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Download size={13} />
                  <span>{downloading ? 'Saving...' : 'Download QR'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyPayload}
                  className="px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  {copied ? <Check size={13} className="text-teal-600" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied Data!' : 'Copy Data'}</span>
                </button>
              </div>

              {/* Decoded Data Inspector / Paramedic View */}
              <div className="pt-2 text-left">
                <button
                  type="button"
                  onClick={() => setShowDecodedPreview(!showDecodedPreview)}
                  className="text-[11px] font-bold text-gray-500 hover:text-gray-800 flex items-center justify-between w-full py-1.5 px-3 bg-gray-50 rounded-lg border border-gray-200/70"
                >
                  <span className="flex items-center gap-1.5">
                    <Eye size={13} className="text-teal-600" />
                    <span>Exact Data Scanned by Paramedic's Phone Camera:</span>
                  </span>
                  <span className="text-[10px] text-teal-600 uppercase font-mono">
                    {showDecodedPreview ? 'Hide' : 'Show'}
                  </span>
                </button>

                {showDecodedPreview && (
                  <div className="mt-2 p-3 bg-gray-900 text-gray-100 rounded-xl text-[11px] font-mono whitespace-pre-wrap leading-relaxed border border-gray-800 shadow-inner max-h-48 overflow-y-auto">
                    {qrFormat === 'vitals' ? emergencyVitalsText : emergencyUrl}
                  </div>
                )}
              </div>

              <div className="flex justify-center items-center gap-1.5 text-[10px] text-teal-700 font-bold uppercase tracking-widest pt-1">
                <span className="h-2 w-2 rounded-full bg-teal-500 animate-pulse"></span>
                <span>Active 100% Offline-Scannable QR Protocol</span>
              </div>
            </div>

            {/* FULLSCREEN HIGH-CONTRAST SCANNING MODAL */}
            {isEnlarged && (
              <div 
                className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in"
                onClick={() => setIsEnlarged(false)}
              >
                <div 
                  className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-gray-200 text-center space-y-4 font-sans"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex justify-between items-center border-b border-gray-150 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="bg-red-600 text-white p-1 rounded-md">
                        <ShieldAlert size={16} />
                      </div>
                      <span className="text-xs font-black text-gray-900 tracking-wider uppercase">Paramedic Field Scanner</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsEnlarged(false)}
                      className="p-1 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 transition cursor-pointer"
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center justify-between text-left">
                    <div>
                      <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Patient</span>
                      <p className="text-sm font-bold text-gray-900">{fullName || 'Alex Mercer'}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider block">Blood Group</span>
                      <span className="text-base font-black text-red-600">
                        {bloodType.split('-')[0]}{bloodType.includes('Positive') ? '+' : '-'}
                      </span>
                    </div>
                  </div>

                  {/* Big High-Contrast QR Code */}
                  <div className="bg-white p-3 rounded-2xl border-2 border-gray-900 shadow-md inline-block">
                    <img 
                      src={qrCodeDataUrl} 
                      alt="Enlarged Emergency QR" 
                      className="w-64 h-64 mx-auto"
                    />
                  </div>

                  <p className="text-[11px] text-gray-500 font-medium leading-normal">
                    Optimized with maximum optical contrast for scanning through vehicle windshields, low-light ambulances, and outdoor conditions.
                  </p>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleDownloadQR}
                      className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Download size={14} />
                      <span>Save QR Image</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsEnlarged(false)}
                      className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
