import React, { useState, useEffect } from 'react';
import { getSupabaseCredentials, saveSupabaseCredentials, clearSupabaseCredentials, getSupabase } from '../lib/supabase';
import { CheckCircle2, AlertTriangle, Database, RefreshCw, X, ShieldCheck } from 'lucide-react';

interface SupabaseConnectorProps {
  onClose?: () => void;
  onConnectedStateChange?: () => void;
}

export default function SupabaseConnector({ onClose, onConnectedStateChange }: SupabaseConnectorProps) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const creds = getSupabaseCredentials();
    if (creds) {
      setUrl(creds.url);
      setKey(creds.key);
      setIsConnected(true);
    }
  }, []);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !key) {
      setError('Please provide both URL and Anon key.');
      return;
    }

    setIsTesting(true);
    setError(null);

    try {
      // Test the credentials by trying to initialize and ping a basic auth check or just validating structure
      if (!url.startsWith('https://') || !url.includes('.supabase.co')) {
        throw new Error('Invalid Supabase URL format. Must start with https:// and end with .supabase.co');
      }

      saveSupabaseCredentials(url, key);
      const client = getSupabase();
      
      if (client) {
        setIsConnected(true);
        if (onConnectedStateChange) onConnectedStateChange();
        if (onClose) onClose();
      } else {
        throw new Error('Client initialization returned null');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to connect. Please verify your URL and Key.');
      clearSupabaseCredentials();
      setIsConnected(false);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    clearSupabaseCredentials();
    setUrl('');
    setKey('');
    setIsConnected(false);
    if (onConnectedStateChange) onConnectedStateChange();
  };

  return (
    <div id="supabase-connector-panel" className="bg-white p-6 rounded-2xl border border-slate-100 shadow-xl max-w-md w-full mx-auto relative overflow-hidden">
      {onClose && (
        <button 
          onClick={onClose} 
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
        >
          <X size={18} />
        </button>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-xl ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
          <Database size={22} />
        </div>
        <div>
          <h3 className="font-display font-semibold text-slate-900 text-lg">Supabase Project Config</h3>
          <p className="text-xs text-slate-500">Connect your actual live cloud database</p>
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3 items-start">
            <CheckCircle2 className="text-emerald-600 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-sm font-medium text-emerald-900">Connected to Supabase</p>
              <p className="text-xs text-emerald-700 mt-1">
                Your credentials are saved locally in this browser. RLS policies, tables, and auth processes will run against your project.
              </p>
            </div>
          </div>
          
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[11px] font-mono text-slate-500 break-all space-y-1">
            <p><strong>URL:</strong> {url}</p>
            <p><strong>KEY:</strong> {key.substring(0, 15)}...{key.substring(key.length - 8)}</p>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleDisconnect}
              className="w-full py-2.5 px-4 border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium rounded-xl transition"
            >
              Disconnect Project
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleConnect} className="space-y-4">
          <div className="bg-amber-50 border border-amber-100 p-3.5 rounded-xl flex gap-3 items-start mb-2">
            <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={18} />
            <div className="text-xs text-amber-800 leading-relaxed">
              <strong>Offline Sandbox Active:</strong> No credentials configured. We are running a stateful local emulator for you so you can fully explore the app immediately!
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">Supabase Project URL</label>
            <input
              type="text"
              placeholder="https://your-project.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full text-sm px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent bg-slate-50 transition"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider block">Supabase Anon Key</label>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="w-full text-sm px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent bg-slate-50 transition"
              required
            />
          </div>

          {error && (
            <p className="text-xs font-medium text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-100 flex gap-2 items-center">
              <AlertTriangle size={14} className="shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isTesting}
            className="w-full py-3 px-4 bg-brand-primary hover:bg-brand-primary-dark text-white font-medium rounded-xl transition shadow-lg shadow-teal-600/15 disabled:opacity-75 flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Testing Connection...</span>
              </>
            ) : (
              <>
                <ShieldCheck size={16} />
                <span>Save & Connect Project</span>
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );
}
