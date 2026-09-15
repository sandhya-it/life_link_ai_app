import React, { useState } from 'react';
import { getSupabase, mockDB, setMockSessionUser, getMockSessionUser, MockUser } from '../lib/supabase';
import { UserRole } from '../types';
import { Shield, Mail, Lock, User, PlusCircle, LogIn, HeartPulse, UserSquare2, Eye, EyeOff, RefreshCw } from 'lucide-react';

interface AuthScreenProps {
  onAuthSuccess: (user: { id: string; email: string; role: UserRole; full_name: string }) => void;
  isSupabaseLive: boolean;
}

export default function AuthScreen({ onAuthSuccess, isSupabaseLive }: AuthScreenProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('patient');
  const [showPassword, setShowPassword] = useState(false);
  
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleDemoSignIn = (roleType: UserRole) => {
    setError(null);
    setLoading(true);
    
    // Quick timeout for realistic feel
    setTimeout(() => {
      const users = mockDB.getUsers();
      const matched = users.find(u => u.role === roleType);
      
      if (matched) {
        setMockSessionUser(matched);
        onAuthSuccess({
          id: matched.id,
          email: matched.email,
          role: matched.role,
          full_name: matched.full_name
        });
      } else {
        setError(`Demo account for ${roleType} not found.`);
      }
      setLoading(false);
    }, 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (isSignUp && !fullName.trim()) {
      setError('Please provide your full name.');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    if (isSupabaseLive) {
      const supabase = getSupabase();
      if (!supabase) {
        setError('Supabase is not initialized. Falling back to local offline mode.');
        setLoading(false);
        return;
      }

      try {
        if (isSignUp) {
          // Sign Up
          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                role: role
              }
            }
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error('Sign up did not return a valid user.');

          // Insert into profiles table
          const { error: profileError } = await supabase
            .from('profiles')
            .upsert({
              id: authData.user.id,
              email: email,
              role: role,
              full_name: fullName,
            });

          if (profileError) {
            console.error('Profile creation error (continuing anyway):', profileError);
          }

          // Automatically seed a default Health Passport if role is patient
          if (role === 'patient') {
            await supabase.from('health_passports').upsert({
              user_id: authData.user.id,
              full_name: fullName,
              blood_type: 'O+',
              allergies: [],
              chronic_conditions: [],
              medications: [],
              emergency_contacts: []
            });
          }

          onAuthSuccess({
            id: authData.user.id,
            email: email,
            role: role,
            full_name: fullName
          });

        } else {
          // Sign In
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error('Sign in failed.');

          // Query role from profiles table
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', authData.user.id)
            .single();

          let userRole: UserRole = 'patient';
          let name = authData.user.user_metadata?.full_name || 'Alex Mercer';

          if (profile && !profileError) {
            userRole = profile.role as UserRole;
            name = profile.full_name || name;
          }

          onAuthSuccess({
            id: authData.user.id,
            email: authData.user.email || email,
            role: userRole,
            full_name: name
          });
        }
      } catch (err: any) {
        setError(err?.message || 'Authentication failed. Please check your credentials.');
      } finally {
        setLoading(false);
      }
    } else {
      // MOCK OFFLINE AUTH
      setTimeout(() => {
        const users = mockDB.getUsers();
        
        if (isSignUp) {
          // Check duplicate
          if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
            setError('This email is already registered.');
            setLoading(false);
            return;
          }

          const newUser: MockUser = {
            id: `usr-${Date.now()}`,
            email: email.trim(),
            role,
            full_name: fullName.trim(),
            password
          };

          // Save User
          mockDB.setUsers([...users, newUser]);
          setMockSessionUser(newUser);

          // Seed health passport for mock patient
          if (role === 'patient') {
            const passports = mockDB.getPassports();
            passports.push({
              user_id: newUser.id,
              full_name: newUser.full_name,
              blood_type: 'O-Positive',
              allergies: [],
              chronic_conditions: [],
              medications: [],
              emergency_contacts: []
            });
            mockDB.setPassports(passports);
          }

          onAuthSuccess({
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            full_name: newUser.full_name
          });
        } else {
          // Login
          const matched = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
          if (!matched) {
            setError('Invalid email or password.');
            setLoading(false);
            return;
          }

          setMockSessionUser(matched);
          onAuthSuccess({
            id: matched.id,
            email: matched.email,
            role: matched.role,
            full_name: matched.full_name
          });
        }
        setLoading(false);
      }, 500);
    }
  };

  return (
    <div id="auth-screen-container" className="min-h-screen flex flex-col justify-between bg-gray-50 px-4 py-8 font-sans max-w-md mx-auto">
      {/* Top Brand Header */}
      <div className="flex flex-col items-center mt-6 text-center">
        <div className="p-3 bg-red-650 text-white rounded-2xl shadow-sm mb-3.5 flex items-center justify-center">
          <HeartPulse size={32} />
        </div>
        <h1 className="font-sans font-black text-2xl tracking-tight text-gray-900">LifeLink AI</h1>
        <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-1.5">Predict. Protect. Respond.</p>
      </div>

      {/* Main card */}
      <div className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-6 md:p-8 my-6">
        <div className="flex justify-center gap-8 mb-6">
          <button
            onClick={() => { setIsSignUp(false); setError(null); }}
            className={`pb-1.5 text-xs font-bold uppercase tracking-widest border-b-2 transition cursor-pointer ${!isSignUp ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-650'}`}
          >
            Log In
          </button>
          <button
            onClick={() => { setIsSignUp(true); setError(null); }}
            className={`pb-1.5 text-xs font-bold uppercase tracking-widest border-b-2 transition cursor-pointer ${isSignUp ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-650'}`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Full Name</label>
              <div className="relative font-sans">
                <User className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Alex Mercer"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full text-xs pl-10 pr-4 py-3 bg-gray-50 border border-gray-200/80 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:bg-white rounded-xl transition font-sans"
                  required
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Email Address</label>
            <div className="relative font-sans">
              <Mail className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full text-xs pl-10 pr-4 py-3 bg-gray-50 border border-gray-200/80 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:bg-white rounded-xl transition font-sans"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Password</label>
            <div className="relative font-sans">
              <Lock className="absolute left-3.5 top-3.5 text-gray-400" size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full text-xs pl-10 pr-10 py-3 bg-gray-50 border border-gray-200/80 focus:outline-none focus:ring-1 focus:ring-gray-300 focus:bg-white rounded-xl transition font-sans"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {isSignUp && (
            <div className="space-y-2 pt-1 font-sans">
              <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Your Platform Role</label>
              <div className="grid grid-cols-2 gap-2">
                {(['patient', 'doctor', 'hospital', 'dispatcher'] as UserRole[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`py-2 px-3 border rounded-xl text-xs font-semibold capitalize transition cursor-pointer ${role === r ? 'border-gray-900 bg-gray-50 text-gray-900' : 'border-gray-200 hover:bg-gray-50 text-gray-500'}`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs font-semibold text-red-750 bg-red-50/60 p-3.5 rounded-xl border border-red-150/40 leading-relaxed font-sans">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gray-900 hover:bg-gray-850 text-white font-bold rounded-xl transition shadow-sm disabled:opacity-75 flex items-center justify-center gap-2 mt-2 text-xs uppercase tracking-wider cursor-pointer"
          >
            {loading ? (
              <RefreshCw className="animate-spin" size={16} />
            ) : isSignUp ? (
              <>
                <PlusCircle size={16} />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <LogIn size={16} />
                <span>Sign In Securely</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            {isSupabaseLive ? (
              <span className="text-teal-600 flex items-center justify-center gap-1.5 font-sans">
                <Shield size={12} /> Connected to Supabase
              </span>
            ) : (
              <span className="text-gray-400 font-sans">
                Offline Sandbox Environment
              </span>
            )}
          </p>
        </div>
      </div>

      {/* QUICK DEMO SELECTION AREA */}
      <div className="w-full bg-gray-100/50 border border-gray-250/40 p-5 rounded-2xl text-center">
        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center justify-center gap-1.5 font-sans font-extrabold">
          <UserSquare2 size={14} className="text-gray-500" /> Quick Demo Access
        </h4>
        <p className="text-xs text-gray-500 mb-3.5 leading-normal font-sans">
          Bypass authentication to evaluate role-based user interfaces.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleDemoSignIn('patient')}
            disabled={loading}
            className="text-xs bg-white hover:bg-gray-50 text-gray-800 font-semibold py-2 px-3 rounded-xl border border-gray-250/70 shadow-sm transition cursor-pointer"
          >
            Patient View
          </button>
          <button
            onClick={() => handleDemoSignIn('doctor')}
            disabled={loading}
            className="text-xs bg-white hover:bg-gray-50 text-gray-800 font-semibold py-2 px-3 rounded-xl border border-gray-250/70 shadow-sm transition cursor-pointer"
          >
            Doctor View
          </button>
          <button
            onClick={() => handleDemoSignIn('hospital')}
            disabled={loading}
            className="text-xs bg-white hover:bg-gray-50 text-gray-800 font-semibold py-2 px-3 rounded-xl border border-gray-250/70 shadow-sm transition cursor-pointer"
          >
            Hospital Staff
          </button>
          <button
            onClick={() => handleDemoSignIn('dispatcher')}
            disabled={loading}
            className="text-xs bg-white hover:bg-gray-50 text-gray-800 font-semibold py-2 px-3 rounded-xl border border-gray-250/70 shadow-sm transition cursor-pointer"
          >
            Dispatcher
          </button>
        </div>
      </div>
    </div>
  );
}
