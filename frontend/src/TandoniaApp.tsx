// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// API base url (frontend can override with REACT_APP_API_URL, VITE_API_URL or window.__API_URL__)
// Use safe runtime checks so bundlers don't leave `process` in the client bundle.
const API_BASE = (
  (typeof process !== 'undefined' && process && process.env && process.env.REACT_APP_API_URL) ||
  (typeof process !== 'undefined' && process && process.env && process.env.VITE_API_URL) ||
  // Vite exposes env via import.meta.env
  (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) ||
  (typeof window !== 'undefined' && (window as any).__API_URL__) ||
  'https://api.tandonia.be'
).replace(/\/$/, '');
import { MapPin, Menu, X, LogIn, LogOut, User, FileText, Home, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Supabase client configuration
// Prefer using Vite env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
// Falls back to window globals if you set them manually in the page.
const SUPABASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL)
  || (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) || '';
const SUPABASE_ANON_KEY = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY)
  || (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) || '';

let _supabaseClient: any = null;
try {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client created in frontend');
  }
} catch (e: any) {
  console.warn('Could not create Supabase client in frontend:', e?.message || e);
}

const getSupabaseClient = () => _supabaseClient;

// Frontend origin to use for auth redirects. Prefer explicit Vite var VITE_FRONTEND_URL,
// otherwise fallback to current location.origin (works during production on the deployed site).
const FRONTEND_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_FRONTEND_URL)
  || (typeof window !== 'undefined' && window.location && window.location.origin)
  || 'https://tandonia-1.onrender.com';

// Auth context using Supabase Auth
const AuthContext = React.createContext<any>(null);

const useAuth = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();
  
  useEffect(() => {
    if (!supabase) {
      // If Supabase client isn't available in the browser, stop loading so the UI can render.
      setLoading(false);
      return;
    }

    // Check current session (handle errors so UI doesn't remain stuck)
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((err: any) => {
        console.error('supabase.getSession error', err);
        setLoading(false);
      });

    // Listen for auth changes
    let subscription: any = null;
    try {
      const res = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        setUser(session?.user ?? null);
      });
      subscription = res?.data?.subscription;
    } catch (err) {
      console.error('supabase.onAuthStateChange error', err);
    }

    return () => {
      try {
        subscription?.unsubscribe?.();
      } catch (_) {}
    };
  }, []);
  
  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase not initialized');
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) throw error;
    
    // Sync user to local database
    if (data.user) {
      await fetch(`${API_BASE}/api/auth/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${data.session.access_token}`
        },
        body: JSON.stringify({
          email: data.user.email,
          name: data.user.user_metadata?.name || data.user.email.split('@')[0]
        })
      });
    }
    
    return data;
  };
  
  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };
  
  const register = async (email: string, password: string, name: string) => {
    if (!supabase) throw new Error('Supabase not initialized');
    
    // Pass an explicit redirect URL so the confirmation email doesn't point to localhost.
    // Supabase embeds redirect URL for email confirmations at the time of signUp.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name },
        // emailRedirectTo is supported by Supabase auth to override the project Site URL for this email
        emailRedirectTo: FRONTEND_URL
      }
    });
    
    if (error) throw error;
    // If there is no session yet (email confirmation flow), don't attempt to sync to the backend now.
    // Trying to sync without a valid access token can cause network/CORS issues or 401s and will
    // surface as "Failed to fetch" in the browser if the network is blocked.
    if (!data.session?.access_token) {
      console.log('Signup requires email confirmation; backend sync deferred until user confirms via email.');
      return data;
    }

    // Sync user to local database when we have an access token
    if (data.user) {
      try {
        const res = await fetch(`${API_BASE}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session?.access_token}`
          },
          body: JSON.stringify({
            email: data.user.email,
            name: name
          })
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => '<no-body>');
          console.warn('Auth sync returned non-OK status', res.status, txt);
        }
      } catch (err) {
        // Network or CORS error
        console.error('Auth sync fetch failed', err);
        // Surface a friendly error to the caller while keeping the signup itself successful
        throw new Error('Registration succeeded but syncing account to backend failed (network error). Please try logging in after confirming your email.');
      }
    }

    return data;
  };

  const getAccessToken = async () => {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token;
  };
  
  return { user, login, logout, register, loading, getAccessToken };
};

const NewsPage = () => {
  const newsItems = [
    {
      date: '2025-11-01',
      title: 'Tandonia Project Launch',
      content: 'Welcome to the Tandonia snail monitoring project! We are collecting data on slug and snail species across Belgium.',
      image_url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=1200&q=80'
    },
    {
      date: '2025-10-15',
      title: 'Database Updates',
      content: 'Our database has been updated to support more detailed habitat information.',
      image_url: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=1200&q=80'
    },
    {
      date: '2025-10-01',
      title: 'New Grid System',
      content: 'Belgium is now divided into 10x10km grid cells for systematic monitoring.',
      image_url: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b6?w=1200&q=80'
    }
  ];

  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto">
  {/* Title removed per user request */}

      <div className="timeline">
        {newsItems.map((item, idx) => (
          <article key={idx} className="timeline-item">
            <div className="timeline-date">{item.date}</div>
            {item.image_url && (
              <img src={item.image_url} alt={item.title} className="timeline-image" />
            )}

            <h3 className="timeline-title">{item.title}</h3>
            <p className="has-text-grey-dark" style={{ lineHeight: 1.6 }}>{item.content}</p>

            <div style={{ marginTop: 10 }}>
              <button className="button is-small is-outlined is-primary">{t('news.read_more')}</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

const AboutPage = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto">
      <section className="about-hero mb-6">
        <div className="columns is-vcentered">
          <div className="column is-6">
            <h1 className="title is-2 has-text-weight-bold">{t('about.title')}</h1>
            <p className="subtitle is-6 mb-4">{t('about.overview')}</p>

            <div className="content">
              <h3 className="is-size-5 has-text-weight-semibold">{t('about.title')}</h3>
              <p>{t('about.overview')}</p>

              <h3 className="is-size-5 has-text-weight-semibold mt-4">{t('about.how_it_works')}</h3>
              <p>{t('about.how_it_works')}</p>

              <div style={{ marginTop: 16 }}>
                <button className="button is-primary is-medium">{t('nav.get_involved')}</button>
                <button className="button is-light is-medium" style={{ marginLeft: 10 }}>{t('about.get_involved')}</button>
              </div>
            </div>
          </div>

          <div className="column is-6">
            <img src="https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=1600&q=80" alt="Field survey" className="hero-image" />
          </div>
        </div>

        <div className="columns mt-5">
          <div className="column">
            <div className="stats-grid">
              <div className="stat">
                <div className="value">1.2k</div>
                <div className="label">Observations</div>
              </div>
              <div className="stat">
                <div className="value">320</div>
                <div className="label">Contributors</div>
              </div>
              <div className="stat">
                <div className="value">10x10 km</div>
                <div className="label">Grid resolution</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="title is-4">What we track</h2>
        <div className="columns is-multiline">
          <div className="column is-4">
            <div className="feature-card">
              <h3 className="is-size-5 has-text-weight-semibold">Species Diversity</h3>
              <p className="is-size-7">We record a broad set of species, with taxonomy and optional photos.</p>
            </div>
          </div>

          <div className="column is-4">
            <div className="feature-card">
              <h3 className="is-size-5 has-text-weight-semibold">Habitat Data</h3>
              <p className="is-size-7">Each checklist includes habitat types and geolocated points so we can monitor trends per habitat.</p>
            </div>
          </div>

          <div className="column is-4">
            <div className="feature-card">
              <h3 className="is-size-5 has-text-weight-semibold">Open Data</h3>
              <p className="is-size-7">Data is exportable and intended to support research and conservation planning.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

const LoginModal = ({ onClose, onLogin, onRegister }: any) => {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    
    try {
      if (isRegister) {
        await onRegister(email, password, name);
      } else {
        await onLogin(email, password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {isRegister ? t('auth.register') : t('auth.login')}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}
        
        <div>
          {isRegister && (
            <div className="mb-4">
              <label className="block text-gray-700 mb-2">{t('auth.name')}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
                disabled={loading}
              />
            </div>
          )}
          
          <div className="mb-4">
              <label className="block text-gray-700 mb-2">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              disabled={loading}
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 mb-2">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              disabled={loading}
            />
          </div>
          
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition disabled:bg-gray-400"
          >
            {loading ? t('auth.processing') : (isRegister ? t('auth.register') : t('auth.login'))}
          </button>
        </div>
        
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-green-600 hover:text-green-700"
            disabled={loading}
          >
            {isRegister ? `${t('auth.login')}?` : `${t('auth.register')}?`}
          </button>
        </div>
      </div>
    </div>
  );
};

const Map = ({ onGridSelect, selectedGrid, onLocationSelect, mode }: any) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const initMap = () => {
      const L = (window as any).L;
      if (!L) {
        setTimeout(initMap, 100);
        return;
      }

      const map = L.map(mapRef.current).setView([50.5, 4.5], 8);
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(map);

      // Grid layer will be populated from your uploaded GeoJSON via API
      const gridLayer = L.layerGroup().addTo(map);
      map.gridLayer = gridLayer;
      map.gridCells = [];
      map.markers = [];

      // TODO: Fetch grid cells from API
      // fetch('/api/grid-cells')
      //   .then(res => res.json())
      //   .then(geojson => {
      //     L.geoJSON(geojson, {
      //       style: { color: '#16a34a', weight: 1, fillOpacity: 0.2 },
      //       onEachFeature: (feature, layer) => {
      //         layer.on('click', () => {
      //           if (!selectedGrid) {
      //             onGridSelect(feature.id, layer.getBounds());
      //           }
      //         });
      //       }
      //     }).addTo(gridLayer);
      //   });
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !(window as any).L) return;

    const L = (window as any).L;

    if (selectedGrid && map.gridLayer) {
      map.gridLayer.clearLayers();
      const cell = map.gridCells.find((c: any) => c.id === selectedGrid);
      if (cell) {
        L.rectangle(cell.bounds, {
          color: '#16a34a',
          weight: 2,
          fillOpacity: 0.3
        }).addTo(map.gridLayer);
        map.fitBounds(cell.bounds);
      }
    }
  }, [selectedGrid]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !(window as any).L) return;

    const L = (window as any).L;

    const handleClick = (e: any) => {
      if (selectedGrid && mode) {
        const color = mode === 'forest' ? '#22c55e' : mode === 'swamp' ? '#3b82f6' : '#ef4444';
        const marker = L.marker(e.latlng, {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`
          })
        }).addTo(map);
        map.markers.push(marker);
        onLocationSelect(mode, e.latlng);
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [selectedGrid, mode, onLocationSelect]);

  return (
    <div>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <div ref={mapRef} className="w-full h-96 rounded-lg shadow-md"></div>
    </div>
  );
};

const ChecklistPage = ({ user }: any) => {
  const [selectedGrid, setSelectedGrid] = useState<any>(null);
  const [gridBounds, setGridBounds] = useState<any>(null);
  const [locationMode, setLocationMode] = useState<any>(null);
  const [locations, setLocations] = useState<any>({
    forest: null,
    swamp: null,
    anthropogenous: null
  });
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [species, setSpecies] = useState<any>({});
  const [timeSpent, setTimeSpent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Access auth helpers from context instead of calling hooks inside handlers
  const auth = React.useContext(AuthContext);

  // Fetch species list from API
  useEffect(() => {
    const fetchSpecies = async () => {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch('/api/species');
        // const data = await response.json();
        
        // Mock data for now - updated with Dutch names
        const mockSpecies = [
          { id: 1, scientific_name: 'Arion ater', dutch_name: 'Zwarte wegslak', observation_count: 245 },
          { id: 2, scientific_name: 'Arion rufus', dutch_name: 'Rode wegslak', observation_count: 189 },
          { id: 3, scientific_name: 'Arion distinctus', dutch_name: 'Gewone aardslak', observation_count: 167 },
          { id: 4, scientific_name: 'Arion silvaticus', dutch_name: 'Bosslak', observation_count: 143 },
          { id: 5, scientific_name: 'Arion intermedius', dutch_name: 'Egel-aardslak', observation_count: 128 },
          { id: 6, scientific_name: 'Arion subfuscus', dutch_name: 'Bruine aardslak', observation_count: 112 },
          { id: 7, scientific_name: 'Arion fuscus', dutch_name: 'Donkere wegslak', observation_count: 98 },
          { id: 8, scientific_name: 'Arion owenii', dutch_name: 'Spaanse aardslak', observation_count: 87 },
          { id: 9, scientific_name: 'Arion vulgaris', dutch_name: 'Spaanse wegslak', observation_count: 156 },
          { id: 10, scientific_name: 'Deroceras reticulatum', dutch_name: 'Genetelde akkerslak', observation_count: 201 },
          { id: 11, scientific_name: 'Deroceras laeve', dutch_name: 'Gladde akkerslak', observation_count: 134 },
          { id: 12, scientific_name: 'Deroceras agreste', dutch_name: 'Gevlekte akkerslak', observation_count: 109 },
          { id: 13, scientific_name: 'Limax maximus', dutch_name: 'Tijgerslak', observation_count: 178 },
          { id: 14, scientific_name: 'Limax cinereoniger', dutch_name: 'Grote aardslak', observation_count: 92 },
          { id: 15, scientific_name: 'Lehmannia marginata', dutch_name: 'Gerande slak', observation_count: 76 },
          { id: 16, scientific_name: 'Tandonia budapestensis', dutch_name: 'Boedapestslak', observation_count: 145 },
          { id: 17, scientific_name: 'Tandonia rustica', dutch_name: 'Landslak', observation_count: 67 },
          { id: 18, scientific_name: 'Boettgerilla pallens', dutch_name: 'Wormslak', observation_count: 54 },
          { id: 19, scientific_name: 'Vitrina pellucida', dutch_name: 'Doorschijnende glazenslak', observation_count: 121 },
          { id: 20, scientific_name: 'Aegopinella nitidula', dutch_name: 'Blinkende glazenslak', observation_count: 103 },
          { id: 21, scientific_name: 'Aegopinella pura', dutch_name: 'Kleine glazenslak', observation_count: 89 },
          { id: 22, scientific_name: 'Oxychilus cellarius', dutch_name: 'Kelder glazenslak', observation_count: 95 },
          { id: 23, scientific_name: 'Oxychilus draparnaudi', dutch_name: 'Grote glanzende glazenslak', observation_count: 71 },
          { id: 24, scientific_name: 'Zonitoides nitidus', dutch_name: 'Zwarte glazenslak', observation_count: 84 },
          { id: 25, scientific_name: 'Vitrea contracta', dutch_name: 'Witte kristalslak', observation_count: 62 },
          { id: 26, scientific_name: 'Vitrea crystallina', dutch_name: 'Kristalslak', observation_count: 78 },
          { id: 27, scientific_name: 'Nesovitrea hammonis', dutch_name: 'Gestreepte glazenslak', observation_count: 91 },
          { id: 28, scientific_name: 'Euconulus fulvus', dutch_name: 'Tapse kristalslak', observation_count: 58 },
          { id: 29, scientific_name: 'Discus rotundatus', dutch_name: 'Bolle kristalslak', observation_count: 106 }
        ];
        
        // Sort by observation count (most common first)
        mockSpecies.sort((a, b) => b.observation_count - a.observation_count);
        
        setSpeciesList(mockSpecies);
        
        // Initialize species counts
        const initialCounts = mockSpecies.reduce((acc: any, sp: any) => ({ ...acc, [sp.id]: 0 }), {});
        setSpecies(initialCounts);
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching species:', error);
        setLoading(false);
      }
    };

    fetchSpecies();
  }, []);

  // Filter species based on search term
  const filteredSpecies = speciesList.filter(sp => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      sp.scientific_name.toLowerCase().includes(search) ||
      (sp.dutch_name && sp.dutch_name.toLowerCase().includes(search))
    );
  });

  const handleGridSelect = (gridId: any, bounds: any) => {
    setSelectedGrid(gridId);
    setGridBounds(bounds);
  };

  const handleLocationSelect = (type: any, latlng: any) => {
    setLocations((prev: any) => ({ ...prev, [type]: latlng }));
    setLocationMode(null);
  };

  const handleSubmit = async () => {
    // Validate at least one location
    if (!locations.forest && !locations.swamp && !locations.anthropogenous) {
      alert('Please add at least one location (forest, swamp, or anthropogenous)');
      return;
    }

    if (!timeSpent || parseInt(timeSpent) < 1) {
      alert('Please enter time spent in minutes');
      return;
    }

    const checklistData = {
      userId: user.id,
      gridCellId: selectedGrid,
      locations,
      species,
      timeSpent: parseInt(timeSpent),
      timestamp: new Date().toISOString()
    };

    try {
      // Get access token from Auth context (provided by App)
      const token = auth && auth.getAccessToken ? await auth.getAccessToken() : null;
      
      const response = await fetch(`${API_BASE}/api/checklists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(checklistData)
      });
      
      if (!response.ok) throw new Error('Submission failed');
      
      setSubmitted(true);
      setTimeout(() => {
        setSelectedGrid(null);
        setLocations({ forest: null, swamp: null, anthropogenous: null });
        const initialCounts = speciesList.reduce((acc: any, sp: any) => ({ ...acc, [sp.id]: 0 }), {});
        setSpecies(initialCounts);
        setTimeSpent('');
        setSubmitted(false);
      }, 3000);
    } catch (error: any) {
      console.error('Submission error:', error);
      alert('Error submitting checklist: ' + error.message);
    }
  };

  if (!user) {
    return (
      <div className="text-center py-12">
        <p className="text-xl text-gray-600">Please login to submit checklists</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">✓</div>
        <h2 className="text-3xl font-bold text-green-600 mb-2">Checklist Submitted!</h2>
        <p className="text-gray-600">Thank you for your contribution</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
  <h1 className="title is-3 has-text-weight-bold mb-4">{t('checklist.title')}</h1>
      <p className="help-note mb-4">Follow the steps: pick a grid cell, add habitat locations on the map, then record species counts.</p>

      <div className="checklist-container">
        <div className="checklist-left">
          <div className="map-card">
            <h3 className="is-size-5 has-text-weight-semibold mb-3">{selectedGrid ? t('checklist.add_locations') : t('checklist.step1')}</h3>
            <Map 
              onGridSelect={handleGridSelect} 
              selectedGrid={selectedGrid}
              onLocationSelect={handleLocationSelect}
              mode={locationMode}
            />

            {selectedGrid && (
              <div style={{ marginTop: 10 }}>
                <div className="mb-3">
                  <strong>Selected grid:</strong> {selectedGrid}
                </div>

                <div className="habitat-buttons">
                  <div className="buttons">
                    <button className={`button is-outlined ${locations.forest ? 'is-success' : ''}`} onClick={() => setLocationMode('forest')} disabled={locations.forest}>Forest {locations.forest && '✓'}</button>
                    <button className={`button is-outlined ${locations.swamp ? 'is-info' : ''}`} onClick={() => setLocationMode('swamp')} disabled={locations.swamp}>Swamp {locations.swamp && '✓'}</button>
                    <button className={`button is-outlined ${locations.anthropogenous ? 'is-danger' : ''}`} onClick={() => setLocationMode('anthropogenous')} disabled={locations.anthropogenous}>Anthropogenous {locations.anthropogenous && '✓'}</button>
                  </div>
                </div>

                <p className="help-note mt-3">Click on the map to add locations for the selected habitat type.</p>
              </div>
            )}
          </div>
        </div>

        <div className="checklist-right">
          <div className="box">
            <h3 className="is-size-5 has-text-weight-semibold mb-3">{t('checklist.step3')}</h3>
            {loading ? (
              <div className="has-text-centered py-6">Loading species...</div>
            ) : (
              <>
                <div className="field">
                  <div className="control">
                    <input className="input" type="text" placeholder="Zoek op Nederlandse of Latijnse naam..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  </div>
                  <p className="help-note mt-2">{filteredSpecies.length} van {speciesList.length} soorten getoond {searchTerm && ` (gefilterd op "${searchTerm}")`}</p>
                </div>

                <div className="species-list box">
                  {filteredSpecies.length === 0 ? (
                    <div className="has-text-centered py-4">Geen soorten gevonden voor "{searchTerm}"</div>
                  ) : (
                    filteredSpecies.map((sp) => (
                      <div key={sp.id} className="species-item">
                        <div>
                          <div className="name">{sp.dutch_name}</div>
                          <div className="is-size-7 has-text-grey">{sp.scientific_name} · {sp.observation_count} waarnemingen</div>
                        </div>
                        <div>
                          <input className="input" type="number" min="0" value={species[sp.id] || 0} onChange={(e) => setSpecies((prev: any) => ({ ...prev, [sp.id]: parseInt(e.target.value) || 0 }))} />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="field mt-4">
                  <label className="label">Time Spent (minutes)</label>
                  <div className="control">
                    <input className="input" type="number" min="1" value={timeSpent} onChange={(e) => setTimeSpent(e.target.value)} />
                  </div>
                </div>

                <div className="submit-row">
                  <button className="button is-primary is-medium" onClick={handleSubmit}>{t('checklist.submit')}</button>
                  <div className="help-note">Make sure you added at least one location and filled species counts as needed.</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('news');
  const [showLogin, setShowLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const auth = useAuth();
  const { t, i18n } = useTranslation();

  // If the user clicked a confirmation link (which supplies an access_token in the URL fragment),
  // Supabase requires the SPA to parse the fragment and set the session. getSessionFromUrl() will
  // parse the URL and set the session in the client. We call it on app load when an access_token
  // is present in the URL to consume the token and clean the URL.
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    try {
      const hasToken = (window.location.hash && window.location.hash.includes('access_token'))
        || (window.location.search && window.location.search.includes('access_token'));
      if (!hasToken) return;

      supabase.auth.getSessionFromUrl()
        .then(({ data, error }) => {
          if (error) console.error('supabase.getSessionFromUrl error', error);
          else console.log('Supabase session from URL handled:', data);
          try { history.replaceState({}, document.title, window.location.pathname + window.location.search); } catch (_) {}
        })
        .catch((err: any) => console.error('supabase.getSessionFromUrl catch', err));
    } catch (err) {
      console.error('Error while handling session from URL:', err);
    }
  }, []);

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <div className="has-navbar-fixed-top">
        {/* Supabase client is initialized from Vite env vars (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) */}

        <nav className="navbar is-primary is-fixed-top" role="navigation" aria-label="main navigation">
          <div className="container">
            <div className="navbar-brand">
              <a className="navbar-item" onClick={() => setCurrentPage('news')} style={{ cursor: 'pointer' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MapPin size={28} />
                  <strong>Tandonia</strong>
                </span>
              </a>

              <a role="button" className={`navbar-burger ${mobileMenuOpen ? 'is-active' : ''}`} aria-label="menu" aria-expanded="false" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
                <span aria-hidden="true"></span>
              </a>
            </div>

            <div className={`navbar-menu ${mobileMenuOpen ? 'is-active' : ''}`}>
              <div className="navbar-start">
                <a className={`navbar-item ${currentPage === 'news' ? 'is-active' : ''}`} onClick={() => setCurrentPage('news')}>{t('nav.news')}</a>
                <a className={`navbar-item ${currentPage === 'about' ? 'is-active' : ''}`} onClick={() => setCurrentPage('about')}>{t('nav.about')}</a>
                <a className={`navbar-item ${currentPage === 'checklist' ? 'is-active' : ''}`} onClick={() => setCurrentPage('checklist')}>{t('nav.checklist')}</a>
              </div>

              <div className="navbar-end">
                <div className="navbar-item">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div>
                      <div className="select">
                        <select value={i18n.language} onChange={(e) => i18n.changeLanguage(e.target.value)}>
                          <option value="nl">NL</option>
                          <option value="en">EN</option>
                          <option value="fr">FR</option>
                        </select>
                      </div>
                    </div>

                    {auth.user ? (
                      <div className="buttons is-right">
                        <span className="tag is-light">{auth.user.email}</span>
                        <button className="button is-light" onClick={auth.logout}><LogOut size={16} style={{ marginRight: 8 }} />{t('nav.logout')}</button>
                      </div>
                    ) : (
                      <div className="buttons">
                        <button className="button is-link" onClick={() => setShowLogin(true)}><LogIn size={16} style={{ marginRight: 8 }} />{t('nav.login')}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </nav>

        <section className="section" style={{ paddingTop: '4.5rem' }}>
          <div className="container">
            {currentPage === 'news' && <NewsPage />}
            {currentPage === 'about' && <AboutPage />}
            {currentPage === 'checklist' && <ChecklistPage user={auth.user} />}
          </div>
        </section>

        {showLogin && (
          <LoginModal
            onClose={() => setShowLogin(false)}
            onLogin={auth.login}
            onRegister={auth.register}
          />
        )}
      </div>
    </AuthContext.Provider>
  );
};

export default App;




