// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';

// API base url (frontend can override with REACT_APP_API_URL, VITE_API_URL or window.__API_URL__)
const API_BASE = (
  process?.env?.REACT_APP_API_URL ||
  process?.env?.VITE_API_URL ||
  (typeof window !== 'undefined' && (window as any).__API_URL__) ||
  'https://api.tandonia.be'
).replace(/\/$/, '');
import { MapPin, Menu, X, LogIn, LogOut, User, FileText, Home, Info } from 'lucide-react';

// Supabase client configuration
// Add this script tag to your HTML: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const getSupabaseClient = () => {
  if (typeof window !== 'undefined' && (window as any).supabase) {
    // Replace with your actual Supabase URL and anon key
    const SUPABASE_URL = 'https://your-project.supabase.co';
    const SUPABASE_ANON_KEY = 'your-anon-key';
    return (window as any).supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return null;
};

// Auth context using Supabase Auth
const AuthContext = React.createContext<any>(null);

const useAuth = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = getSupabaseClient();
  
  useEffect(() => {
    if (!supabase) return;

    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    });
    
    if (error) throw error;
    
    // Sync user to local database
    if (data.user) {
      await fetch(`${API_BASE}/api/auth/sync`, {
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
      image_url: 'https://images.unsplash.com/photo-1530587191325-3db32d826c18?w=800&q=80'
    },
    {
      date: '2025-10-15',
      title: 'Database Updates',
      content: 'Our database has been updated to support more detailed habitat information.',
      image_url: 'https://images.unsplash.com/photo-1544383835-bda2bc66a55d?w=800&q=80'
    },
    {
      date: '2025-10-01',
      title: 'New Grid System',
      content: 'Belgium is now divided into 10x10km grid cells for systematic monitoring.',
      image_url: 'https://images.unsplash.com/photo-1569163139394-de4798aa62b6?w=800&q=80'
    }
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Tandonia News</h1>
      <div className="space-y-6">
        {newsItems.map((item, idx) => (
          <div key={idx} className="bg-white rounded-lg shadow-md overflow-hidden border-l-4 border-green-600">
            {item.image_url && (
              <img 
                src={item.image_url} 
                alt={item.title}
                className="w-full h-64 object-cover"
              />
            )}
            <div className="p-6">
              <div className="text-sm text-gray-500 mb-2">{item.date}</div>
              <h2 className="text-2xl font-semibold mb-3 text-gray-800">{item.title}</h2>
              <p className="text-gray-700">{item.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const AboutPage = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">About Tandonia</h1>
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Project Overview</h2>
        <p className="text-gray-700 mb-4">
          The Tandonia project aims to monitor and document slug and snail populations across Belgium.
          By collecting systematic data in 10x10km grid cells, we can track species distribution and
          abundance over time.
        </p>
        
        <h2 className="text-2xl font-semibold mb-4 mt-8 text-gray-800">How It Works</h2>
        <p className="text-gray-700 mb-4">
          Volunteers select a grid cell on the map and record observations from three habitat types:
          forest, swamp, and anthropogenous (human-modified) areas. For each habitat, observers count
          the number of individuals of each snail species found.
        </p>
        
        <h2 className="text-2xl font-semibold mb-4 mt-8 text-gray-800">Get Involved</h2>
        <p className="text-gray-700">
          Create an account and start submitting checklists! Your observations contribute to our
          understanding of snail biodiversity in Belgium.
        </p>
      </div>
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">
            {isRegister ? 'Register' : 'Login'}
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
              <label className="block text-gray-700 mb-2">Name</label>
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
            <label className="block text-gray-700 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              disabled={loading}
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Password</label>
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
            {loading ? 'Processing...' : (isRegister ? 'Register' : 'Login')}
          </button>
        </div>
        
        <div className="mt-4 text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-green-600 hover:text-green-700"
            disabled={loading}
          >
            {isRegister ? 'Already have an account? Login' : "Don't have an account? Register"}
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
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Submit Checklist</h1>
      
      <div className="mb-8">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">
          {selectedGrid ? 'Add Locations' : 'Step 1: Select Grid Cell'}
        </h2>
        <Map 
          onGridSelect={handleGridSelect} 
          selectedGrid={selectedGrid}
          onLocationSelect={handleLocationSelect}
          mode={locationMode}
        />
      </div>

      {selectedGrid && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Step 2: Add Habitat Locations</h3>
          <p className="text-gray-600 mb-4">Click on the map to add location markers for each habitat type</p>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <button
              onClick={() => setLocationMode('forest')}
              disabled={locations.forest}
              className={`p-4 rounded-lg border-2 ${
                locations.forest 
                  ? 'bg-green-100 border-green-600' 
                  : 'border-gray-300 hover:border-green-600'
              } ${locationMode === 'forest' ? 'ring-2 ring-green-600' : ''}`}
            >
              <div className="font-semibold">Forest</div>
              {locations.forest && <div className="text-sm text-green-600">✓ Added</div>}
            </button>
            
            <button
              onClick={() => setLocationMode('swamp')}
              disabled={locations.swamp}
              className={`p-4 rounded-lg border-2 ${
                locations.swamp 
                  ? 'bg-blue-100 border-blue-600' 
                  : 'border-gray-300 hover:border-blue-600'
              } ${locationMode === 'swamp' ? 'ring-2 ring-blue-600' : ''}`}
            >
              <div className="font-semibold">Swamp</div>
              {locations.swamp && <div className="text-sm text-blue-600">✓ Added</div>}
            </button>
            
            <button
              onClick={() => setLocationMode('anthropogenous')}
              disabled={locations.anthropogenous}
              className={`p-4 rounded-lg border-2 ${
                locations.anthropogenous 
                  ? 'bg-red-100 border-red-600' 
                  : 'border-gray-300 hover:border-red-600'
              } ${locationMode === 'anthropogenous' ? 'ring-2 ring-red-600' : ''}`}
            >
              <div className="font-semibold">Anthropogenous</div>
              {locations.anthropogenous && <div className="text-sm text-red-600">✓ Added</div>}
            </button>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-4 text-gray-800">Step 3: Species Abundance</h3>
            
            {loading ? (
              <div className="text-center py-8 text-gray-600">Loading species...</div>
            ) : (
              <div>
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Zoek op Nederlandse of Latijnse naam..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-2">
                    {filteredSpecies.length} van {speciesList.length} soorten getoond
                    {searchTerm && ` (gefilterd op "${searchTerm}")`}
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6 max-h-96 overflow-y-auto p-4 bg-gray-50 rounded-lg">
                  {filteredSpecies.length === 0 ? (
                    <div className="col-span-2 text-center py-8 text-gray-500">
                      Geen soorten gevonden voor "{searchTerm}"
                    </div>
                  ) : (
                    filteredSpecies.map(sp => (
                      <div key={sp.id} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-green-500 transition">
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-800">{sp.dutch_name}</div>
                          <div className="text-xs text-gray-500 italic">{sp.scientific_name}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {sp.observation_count} waarnemingen
                          </div>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={species[sp.id] || 0}
                          onChange={(e) => setSpecies((prev: any) => ({ ...prev, [sp.id]: parseInt(e.target.value) || 0 }))}
                          className="w-20 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 text-center font-semibold"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="mb-6">
              <label className="block text-gray-700 font-semibold mb-2">
                Time Spent (minutes)
              </label>
              <input
                type="number"
                min="1"
                value={timeSpent}
                onChange={(e) => setTimeSpent(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600"
              />
            </div>

            <button
              onClick={handleSubmit}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition text-lg font-semibold"
            >
              Submit Checklist
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const App = () => {
  const [currentPage, setCurrentPage] = useState('news');
  const [showLogin, setShowLogin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const auth = useAuth();

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <div className="min-h-screen bg-gray-100">
        {/* Add Supabase script */}
        <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
        
        <nav className="bg-green-700 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex justify-between items-center py-4">
              <div className="flex items-center space-x-2">
                <MapPin size={32} />
                <h1 className="text-2xl font-bold">Tandonia</h1>
              </div>

              <div className="hidden md:flex items-center space-x-6">
                <button
                  onClick={() => setCurrentPage('news')}
                  className={`flex items-center space-x-1 hover:text-green-200 ${
                    currentPage === 'news' ? 'font-bold' : ''
                  }`}
                >
                  <Home size={20} />
                  <span>News</span>
                </button>
                <button
                  onClick={() => setCurrentPage('about')}
                  className={`flex items-center space-x-1 hover:text-green-200 ${
                    currentPage === 'about' ? 'font-bold' : ''
                  }`}
                >
                  <Info size={20} />
                  <span>About</span>
                </button>
                <button
                  onClick={() => setCurrentPage('checklist')}
                  className={`flex items-center space-x-1 hover:text-green-200 ${
                    currentPage === 'checklist' ? 'font-bold' : ''
                  }`}
                >
                  <FileText size={20} />
                  <span>Submit Checklist</span>
                </button>

                {auth.user ? (
                  <div className="flex items-center space-x-4">
                    <span className="flex items-center space-x-1">
                      <User size={20} />
                      <span>{auth.user.email}</span>
                    </span>
                    <button
                      onClick={auth.logout}
                      className="flex items-center space-x-1 hover:text-green-200"
                    >
                      <LogOut size={20} />
                      <span>Logout</span>
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLogin(true)}
                    className="flex items-center space-x-1 bg-green-600 px-4 py-2 rounded-lg hover:bg-green-500"
                  >
                    <LogIn size={20} />
                    <span>Login</span>
                  </button>
                )}
              </div>

              <button
                className="md:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>

            {mobileMenuOpen && (
              <div className="md:hidden pb-4 space-y-2">
                <button
                  onClick={() => { setCurrentPage('news'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 hover:text-green-200"
                >
                  News
                </button>
                <button
                  onClick={() => { setCurrentPage('about'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 hover:text-green-200"
                >
                  About
                </button>
                <button
                  onClick={() => { setCurrentPage('checklist'); setMobileMenuOpen(false); }}
                  className="block w-full text-left py-2 hover:text-green-200"
                >
                  Submit Checklist
                </button>
                {auth.user ? (
                  <>
                    <div className="py-2">{auth.user.email}</div>
                    <button
                      onClick={() => { auth.logout(); setMobileMenuOpen(false); }}
                      className="block w-full text-left py-2 hover:text-green-200"
                    >
                      Logout
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setShowLogin(true); setMobileMenuOpen(false); }}
                    className="block w-full text-left py-2 bg-green-600 px-4 rounded-lg hover:bg-green-500"
                  >
                    Login
                  </button>
                )}
              </div>
            )}
          </div>
        </nav>

        <main className="max-w-7xl mx-auto px-4 py-8">
          {currentPage === 'news' && <NewsPage />}
          {currentPage === 'about' && <AboutPage />}
          {currentPage === 'checklist' && <ChecklistPage user={auth.user} />}
        </main>

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
