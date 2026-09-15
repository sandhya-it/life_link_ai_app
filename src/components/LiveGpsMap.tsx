import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { 
  Navigation, Crosshair, MapPin, Ambulance, Hospital, 
  Maximize2, Minimize2, Compass, Layers, ShieldAlert 
} from 'lucide-react';
import { AmbulanceLocation } from '../types';

interface LiveGpsMapProps {
  patientLat: number;
  patientLng: number;
  patientName?: string;
  ambulanceLocation: AmbulanceLocation | null;
  hospitalName?: string;
  hospitalLat?: number;
  hospitalLng?: number;
  interactive?: boolean;
  className?: string;
  onEtaUpdate?: (etaString: string, distanceKm: number) => void;
}

// Haversine distance calculation in kilometers
function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function LiveGpsMap({
  patientLat,
  patientLng,
  patientName = 'Alex Mercer',
  ambulanceLocation,
  hospitalName = 'Metro Central Hospital (Trauma 1)',
  hospitalLat = patientLat + 0.018,
  hospitalLng = patientLng + 0.016,
  interactive = true,
  className = '',
  onEtaUpdate
}: LiveGpsMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const patientMarkerRef = useRef<L.Marker | null>(null);
  const ambulanceMarkerRef = useRef<L.Marker | null>(null);
  const hospitalMarkerRef = useRef<L.Marker | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const hospitalRouteRef = useRef<L.Polyline | null>(null);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [followAmbulance, setFollowAmbulance] = useState(true);
  const [mapTheme, setMapTheme] = useState<'voyager' | 'dark'>('voyager');
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [calculatedEta, setCalculatedEta] = useState<string>('En Route');
  const [simSpeed, setSimSpeed] = useState<number>(48); // km/h

  // Tile layer sources
  const tileUrls = {
    voyager: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  };

  // Helper to construct realistic road trajectory waypoints
  const generateRoadWaypoints = (startLat: number, startLng: number, endLat: number, endLng: number) => {
    // Generate intermediate dogleg points simulating city grid navigation
    const midLat = startLat + (endLat - startLat) * 0.45;
    const midLng = startLng + (endLng - startLng) * 0.55;
    const doglegLat = startLat + (endLat - startLat) * 0.75;
    const doglegLng = endLng;

    return [
      [startLat, startLng],
      [midLat, startLng],
      [midLat, midLng],
      [doglegLat, midLng],
      [endLat, endLng]
    ] as L.LatLngExpression[];
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [patientLat, patientLng],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      touchZoom: interactive
    });

    // Add CartoDB Voyager tiles (clean, beautiful, high-contrast, free)
    L.tileLayer(tileUrls[mapTheme], {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    mapInstanceRef.current = map;

    // Custom Patient Marker (Pulsating Emergency Radar)
    const patientIcon = L.divIcon({
      className: 'custom-patient-pin',
      html: `
        <div class="relative flex items-center justify-center" style="width: 44px; height: 44px;">
          <div class="absolute inset-0 rounded-full bg-teal-500/30 animate-ping"></div>
          <div class="absolute inset-2 rounded-full bg-teal-600/40 animate-pulse"></div>
          <div class="relative w-8 h-8 rounded-full bg-teal-700 border-2 border-white shadow-xl flex items-center justify-center text-white font-bold text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-md whitespace-nowrap">
            PATIENT
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    const patientMarker = L.marker([patientLat, patientLng], { icon: patientIcon }).addTo(map);
    patientMarker.bindPopup(`
      <div class="p-1 font-sans text-xs">
        <strong class="text-gray-950 font-bold block">${patientName}</strong>
        <span class="text-gray-500 font-mono text-[10px]">Lat: ${patientLat.toFixed(5)}, Lng: ${patientLng.toFixed(5)}</span>
        <div class="mt-1 text-teal-700 font-bold text-[10px] uppercase">● Active SOS Beacon Locked</div>
      </div>
    `);
    patientMarkerRef.current = patientMarker;

    // Hospital Marker
    const hospitalIcon = L.divIcon({
      className: 'custom-hospital-pin',
      html: `
        <div class="relative flex items-center justify-center" style="width: 40px; height: 40px;">
          <div class="w-7 h-7 rounded-xl bg-blue-700 border-2 border-white shadow-lg flex items-center justify-center text-white font-extrabold text-xs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 6v12m-6-6h12"></path>
            </svg>
          </div>
          <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-blue-950 text-white font-sans text-[8px] font-bold px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap">
            TRAUMA BAY 1
          </div>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    });

    const hospitalMarker = L.marker([hospitalLat, hospitalLng], { icon: hospitalIcon }).addTo(map);
    hospitalMarker.bindPopup(`
      <div class="p-1 font-sans text-xs">
        <strong class="text-blue-900 font-bold block">${hospitalName}</strong>
        <span class="text-gray-500 text-[10px]">Designated Receiving Trauma Center</span>
      </div>
    `);
    hospitalMarkerRef.current = hospitalMarker;

    // Hospital Route Line (dotted secondary line)
    const hospitalWaypoints = generateRoadWaypoints(patientLat, patientLng, hospitalLat, hospitalLng);
    const hospitalRoute = L.polyline(hospitalWaypoints, {
      color: '#3b82f6',
      weight: 3,
      dashArray: '4, 8',
      opacity: 0.6
    }).addTo(map);
    hospitalRouteRef.current = hospitalRoute;

    // Force tile recalculation
    setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Ambulance Position, Route, Distance & ETA
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!ambulanceLocation) return;

    const ambLat = ambulanceLocation.latitude;
    const ambLng = ambulanceLocation.longitude;

    // Calculate live distance & ETA
    const dist = calculateHaversineDistance(ambLat, ambLng, patientLat, patientLng);
    setDistanceKm(dist);

    // Compute realistic ETA based on simulated 45-60 km/h emergency speed
    let etaMinutes = Math.max(1, Math.round((dist / 48) * 60));
    let etaText = `${etaMinutes} min${etaMinutes > 1 ? 's' : ''}`;
    if (dist < 0.1) {
      etaText = 'Arriving Now (<100m)';
    }
    setCalculatedEta(etaText);
    setSimSpeed(Math.floor(45 + Math.sin(Date.now() / 1000) * 8));

    if (onEtaUpdate) {
      onEtaUpdate(etaText, dist);
    }

    // Update or Create Ambulance Marker with Live Siren Strobe
    if (!ambulanceMarkerRef.current) {
      const ambulanceIcon = L.divIcon({
        className: 'custom-ambulance-pin',
        html: `
          <div class="relative flex items-center justify-center" style="width: 48px; height: 48px;">
            <div class="absolute -top-1 w-3.5 h-3.5 rounded-full bg-red-600 animate-ping opacity-90"></div>
            <div class="relative w-9 h-9 rounded-2xl bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-white font-bold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 17h4V5H2v12h3"></path>
                <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h2"></path>
                <path d="M14 17h4"></path>
                <circle cx="7.5" cy="17.5" r="2.5"></circle>
                <circle cx="17.5" cy="17.5" r="2.5"></circle>
              </svg>
            </div>
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-red-650 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 border border-red-500">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              EMS-04 (${dist < 0.1 ? 'ARRIVED' : dist.toFixed(1) + 'km'})
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      });

      const ambMarker = L.marker([ambLat, ambLng], { icon: ambulanceIcon, zIndexOffset: 1000 }).addTo(map);
      ambulanceMarkerRef.current = ambMarker;
    } else {
      ambulanceMarkerRef.current.setLatLng([ambLat, ambLng]);
      // Update badge distance label inside popup or marker
      ambulanceMarkerRef.current.setIcon(L.divIcon({
        className: 'custom-ambulance-pin',
        html: `
          <div class="relative flex items-center justify-center" style="width: 48px; height: 48px;">
            <div class="absolute -top-1 w-3.5 h-3.5 rounded-full bg-red-600 animate-ping opacity-90"></div>
            <div class="relative w-9 h-9 rounded-2xl bg-red-600 border-2 border-white shadow-2xl flex items-center justify-center text-white font-bold">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10 17h4V5H2v12h3"></path>
                <path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5v8h2"></path>
                <path d="M14 17h4"></path>
                <circle cx="7.5" cy="17.5" r="2.5"></circle>
                <circle cx="17.5" cy="17.5" r="2.5"></circle>
              </svg>
            </div>
            <div class="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-red-650 text-white font-mono text-[9px] font-bold px-1.5 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 border border-red-500">
              <span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              EMS-04 (${dist < 0.1 ? 'ARRIVED' : dist.toFixed(1) + 'km'})
            </div>
          </div>
        `,
        iconSize: [48, 48],
        iconAnchor: [24, 24]
      }));
    }

    // Update Live Road Navigation Polyline Route
    const routePoints = generateRoadWaypoints(ambLat, ambLng, patientLat, patientLng);

    if (!routePolylineRef.current) {
      const route = L.polyline(routePoints, {
        color: '#dc2626',
        weight: 5,
        opacity: 0.85,
        dashArray: '8, 6',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(map);
      routePolylineRef.current = route;
    } else {
      routePolylineRef.current.setLatLngs(routePoints);
    }

    // Auto fit or follow bounds if toggle active
    if (followAmbulance) {
      const bounds = L.latLngBounds([
        [patientLat, patientLng],
        [ambLat, ambLng],
        [hospitalLat, hospitalLng]
      ]);
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true });
    }

  }, [ambulanceLocation, patientLat, patientLng, hospitalLat, hospitalLng, followAmbulance]);

  // Recenter actions
  const handleRecenterPatient = () => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo([patientLat, patientLng], 16, { animate: true });
  };

  const handleRecenterAmbulance = () => {
    if (!mapInstanceRef.current || !ambulanceLocation) return;
    mapInstanceRef.current.flyTo([ambulanceLocation.latitude, ambulanceLocation.longitude], 16, { animate: true });
  };

  const handleFitAll = () => {
    if (!mapInstanceRef.current) return;
    const points: [number, number][] = [[patientLat, patientLng], [hospitalLat, hospitalLng]];
    if (ambulanceLocation) {
      points.push([ambulanceLocation.latitude, ambulanceLocation.longitude]);
    }
    mapInstanceRef.current.fitBounds(points, { padding: [50, 50], animate: true });
    setFollowAmbulance(true);
  };

  // Toggle map theme (Voyager vs Dark)
  const toggleMapTheme = () => {
    if (!mapInstanceRef.current) return;
    const nextTheme = mapTheme === 'voyager' ? 'dark' : 'voyager';
    setMapTheme(nextTheme);

    // Remove old tile layer and add new
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapInstanceRef.current?.removeLayer(layer);
      }
    });

    L.tileLayer(tileUrls[nextTheme], {
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(mapInstanceRef.current);
  };

  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-gray-200 shadow-inner flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 rounded-none h-screen' : className || 'h-72'}`}>
      
      {/* Real Map Leaflet DOM Mount */}
      <div 
        ref={mapContainerRef} 
        className="w-full h-full bg-slate-100 z-0" 
        style={{ minHeight: isFullscreen ? '100vh' : '100%' }}
      />

      {/* Floating GPS HUD Banner (Top Left) */}
      <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-2 rounded-xl shadow-lg border border-gray-200/80 flex items-center gap-2.5 font-sans">
        <div className="relative">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-ping absolute inset-0 opacity-75"></span>
        </div>
        <div>
          <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-tight flex items-center gap-1">
            <Compass size={10} className="text-gray-500" /> LIVE GPS ROUTE
          </div>
          <div className="text-xs font-sans font-extrabold text-gray-900 leading-tight flex items-center gap-1.5">
            <span>{calculatedEta}</span>
            <span className="text-gray-300">•</span>
            <span className="text-red-650 font-mono text-[11px]">{distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : 'Tracking'}</span>
          </div>
        </div>
      </div>

      {/* Speed & Emergency Priority Strobe (Top Right) */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <div className="bg-red-650 text-white font-mono text-[9px] font-extrabold px-2 py-1.5 rounded-xl shadow-md flex items-center gap-1.5 border border-red-500">
          <Ambulance size={12} className="animate-pulse" />
          <span>{simSpeed} KM/H</span>
        </div>

        <button
          onClick={toggleMapTheme}
          title="Toggle Dark/Light Map"
          className="p-1.5 bg-white/90 backdrop-blur-md hover:bg-white text-gray-700 rounded-xl shadow-md border border-gray-200 transition cursor-pointer"
        >
          <Layers size={14} />
        </button>

        <button
          onClick={() => {
            setIsFullscreen(!isFullscreen);
            setTimeout(() => {
              mapInstanceRef.current?.invalidateSize();
            }, 200);
          }}
          title={isFullscreen ? "Exit Fullscreen" : "Expand Map"}
          className="p-1.5 bg-white/90 backdrop-blur-md hover:bg-white text-gray-700 rounded-xl shadow-md border border-gray-200 transition cursor-pointer"
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>

      {/* Floating Control Toolbar (Bottom Right) */}
      <div className="absolute bottom-3 right-3 z-10 flex flex-col gap-1.5">
        <button
          onClick={handleRecenterPatient}
          title="Center on Patient"
          className="p-2 bg-white/95 backdrop-blur-md hover:bg-white text-teal-700 rounded-xl shadow-lg border border-gray-200 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        >
          <Crosshair size={14} />
          <span className="hidden sm:inline">Patient</span>
        </button>

        <button
          onClick={handleRecenterAmbulance}
          title="Center on Ambulance"
          className="p-2 bg-white/95 backdrop-blur-md hover:bg-white text-red-650 rounded-xl shadow-lg border border-gray-200 transition cursor-pointer flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
        >
          <Navigation size={14} />
          <span className="hidden sm:inline">Ambulance</span>
        </button>

        <button
          onClick={handleFitAll}
          title="View Full Route"
          className="p-2 bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-lg transition cursor-pointer flex items-center justify-center"
        >
          <MapPin size={14} />
        </button>
      </div>

      {/* Bottom Route Legend bar */}
      <div className="absolute bottom-3 left-3 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-md border border-gray-200 text-[9px] font-bold text-gray-600 flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-600 inline-block"></span>
          <span>Patient</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
          <span>Ambulance</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
          <span>Hospital</span>
        </div>
      </div>

    </div>
  );
}
