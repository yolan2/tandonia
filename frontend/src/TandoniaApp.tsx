// @ts-nocheck
import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import L from 'leaflet';

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

function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return _supabaseClient;
}

// Minimal Auth context + hook used by the app. The app expects an object
// with { user, login, logout, register, loading, getAccessToken }.
const AuthContext = React.createContext<any>(null);

const useAuth = () => {
  // Provide a simple hook that wires up Supabase auth and exposes helpers.
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    // initialize current session
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setUser(data?.session?.user ?? null);
      } catch (err) {
        console.warn('getSession failed', err);
      } finally {
        setLoading(false);
      }
    })();

    // subscribe to auth changes
    let sub: any = null;
    try {
      const res = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        setUser(session?.user ?? null);
      });
      sub = res?.data?.subscription;
    } catch (err) {
      console.warn('auth subscription failed', err);
    }

    return () => {
      if (sub) sub.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const res = await supabase.auth.signInWithPassword({ email, password });
    if (res.error) throw res.error;
    setUser(res.data?.user ?? null);
    return res;
  };

  const logout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  const register = async (email: string, password: string, name?: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const res = await supabase.auth.signUp({ email, password, options: { data: { name } } });
    if (res.error) throw res.error;
    // don't force-set user here; email confirmation flow may be required
    return res;
  };

  const getAccessToken = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token ?? null;
  };

  return { user, login, logout, register, loading, getAccessToken };
};

const TandoniaApp = () => {
  const { i18n } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadFromApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news?lang=${i18n.language}`);
        if (!res.ok) throw new Error('no-api');
        const data = await res.json();
        if (!mounted) return;
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
        return true;
      } catch (err) {
        setError(err?.message || 'Failed to load news');
        setLoading(false);
        return false;
      }
    };

    const loadFromSupabase = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('no-supabase');
        const { data, error } = await supabase.from('news').select('*').order('date', { ascending: false });
        if (error) throw error;
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
        return true;
      } catch (err) {
        setError(err?.message || 'Failed to load news');
        setLoading(false);
        return false;
      }
    };

    (async () => {
      const ok = await loadFromApi();
      if (!ok) await loadFromSupabase();
    })();

    return () => { mounted = false; };
  }, [i18n.language]);

  useEffect(() => {
    const supabase = getSupabaseClient();
    let subscription = null;
    if (supabase) {
      try {
        const res = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
        });
        subscription = res?.data?.subscription;
      } catch (err) {
        console.error('supabase.onAuthStateChange error', err);
      }
    }
    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  // ...rest of component code...

  const logout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
  };

  // ...render logic...



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

    useEffect(() => {
      let mounted = true;

      const loadFromApi = async () => {
        try {
          // Pass language as query param for API translation, fallback to client translation
          const res = await fetch(`${API_BASE}/api/news?lang=${i18n.language}`);
          if (!res.ok) throw new Error('no-api');
          const data = await res.json();
          if (!mounted) return;
          setItems(Array.isArray(data) ? data : []);
          setLoading(false);
          return true;
        } catch (err) {
          // ...existing code...
        }
      };

      const loadFromSupabase = async () => {
        // ...existing code...
      };

      (async () => {
        const ok = await loadFromApi();
        if (!ok) await loadFromSupabase();
      })();

      return () => { mounted = false; };
    }, [i18n.language]);
// Removed stray closing brackets and misplaced code blocks
  
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
  const { t } = useTranslation();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const loadFromApi = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/news`);
        if (!res.ok) throw new Error('no-api');
        const data = await res.json();
        if (!mounted) return;
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
        return true;
      } catch (err) {
        // API not available or returned error — fall back to Supabase if available
        return false;
      }
    };

    const loadFromSupabase = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('no-supabase');
        const { data, error } = await supabase.from('news').select('*').order('date', { ascending: false });
        if (error) throw error;
        if (!mounted) return;
        setItems(data ?? []);
        setLoading(false);
        return true;
      } catch (err: any) {
        if (!mounted) return;
        setError(err?.message || 'Failed to load news');
        setLoading(false);
        return false;
      }
    };

    (async () => {
      const ok = await loadFromApi();
      if (!ok) await loadFromSupabase();
    })();

    return () => { mounted = false; };
  }, []);

  if (loading) return <div className="max-w-4xl mx-auto">{t('news.reading') || 'Loading...'}</div>;
  if (error) return <div className="max-w-4xl mx-auto has-text-danger">{error}</div>;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="timeline">
        {items.map((item: any, idx: number) => (
          <article key={item.id ?? idx} className="timeline-item">
            <div className="timeline-date">{item.date || item.published_at || ''}</div>

                {item.image_url && (
              <figure>
                <div className="image-meta">
                  <span className="author">{item.author ? t('news.by', { author: item.author }) : '—'}</span>
                  <span className="license">{item.license ? t('news.license', { license: item.license }) : '—'}</span>
                </div>
                <img src={item.image_url} alt={item.title} className="timeline-image" />
              </figure>
            )}

            <h3 className="timeline-title">{item.title}</h3>
            <p className="has-text-grey-dark" style={{ lineHeight: 1.6 }}>{item.content || item.body || item.excerpt}</p>

            {/* Removed 'Lees meer' button as requested */}
          </article>
        ))}
      </div>
    </div>
  );
};

const PillClamsIdentificationPage = () => {
  const { t } = useTranslation();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [matches, setMatches] = useState<any[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [species, setSpecies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const questions = [
    { key: "plica", text: "Is a plica present?" },
    { key: "glossy", text: "Is the shell glossy?" },
    { key: "shape", text: "Is the shape oval to sub-triangular?" },
    { key: "posterior_point", text: "Is the posterior part pointed?" },
    { key: "callus_present", text: "Is there a callus present?" },
    { key: "c4_shape", text: "Is C4 straight or slightly curved?" },
    { key: "c2_shape", text: "Is C2 strong?" },
    { key: "striation_regular", text: "Are the shell striations regular?" },
    { key: "ligament_long", text: "Is the ligament long?" },
    { key: "umbo_taal", text: "Is the umbo clearly visible?" },
    { key: "ligamentpit_shape", text: "Is the ligament pit shape curved?" }
  ];

  // Load species data from Supabase
  useEffect(() => {
    let mounted = true;

    const loadSpeciesData = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) {
          throw new Error('Supabase client not initialized');
        }

        const { data, error } = await supabase
          .from('pill_clams')
          .select('*')
          .order('species', { ascending: true });

        if (error) throw error;

        if (!mounted) return;
        
        // Transform data to match expected format (image_url -> image)
        const transformedData = (data || []).map((item: any) => ({
          ...item,
          image: item.image_url || 'no image'
        }));
        
        setSpecies(transformedData);
        setLoading(false);
      } catch (err: any) {
        if (!mounted) return;
        console.error('Error loading pill clam species:', err);
        setError(err.message || 'Failed to load species data');
        setLoading(false);
      }
    };

    loadSpeciesData();

    return () => { mounted = false; };
  }, []);

  const normalize = (value: any) => {
    if (typeof value === 'string') {
      value = value.toLowerCase();
      if (value.includes("not") || value === "no" || value === "0") return "no";
      if (value === "yes" || value === "1" || value === "present") return "yes";
    }
    if (value === 1 || value === "1") return "yes";
    if (value === 0 || value === "0") return "no";
    return "unknown";
  };

  const handleAnswer = (val: string) => {
    const newAnswers = { ...answers, [questions[current].key]: val };
    setAnswers(newAnswers);
    
    if (current + 1 < questions.length) {
      setCurrent(current + 1);
    } else {
      evaluateMatches(newAnswers);
    }
  };

  const evaluateMatches = (finalAnswers: Record<string, string>) => {
    const filtered = species.filter(s =>
      questions.every(q => {
        // Treat unanswered questions as 'unknown' so partial quizzes work
        const a = finalAnswers[q.key] ?? 'unknown';
        const t = normalize((s as any)[q.key]);
        return a === 'unknown' || t === 'unknown' || a === t;
      })
    );
    setMatches(filtered);
    setShowResult(true);
  };

  const resetQuiz = () => {
    setAnswers({});
    setCurrent(0);
    setMatches([]);
    setShowResult(false);
  };

  const question = questions[current];
  const yesList = question ? species.filter(s =>
    normalize((s as any)[question.key]) === "yes" && s.image && s.image !== "no image"
  ) : [];
  const noList = question ? species.filter(s =>
    normalize((s as any)[question.key]) === "no" && s.image && s.image !== "no image"
  ) : [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="hero is-primary mb-5">
        <div className="hero-body">
          <h1 className="title is-2 has-text-white">{t('identification.pillClams.title')}</h1>
          {/* subtitle intentionally removed for identification pages */}
            <p className="subtitle has-text-dark">{t('identification.pillClams.subtitle')}</p>
        </div>
      </div>

      {loading ? (
        <div className="box">
          <p className="has-text-centered">{t('news.reading')}</p>
        </div>
      ) : error ? (
        <div className="box">
          <p className="has-text-danger has-text-centered">{error}</p>
        </div>
      ) : !showResult ? (
        <>
          <div className="box">
            <h2 className="title is-4">{question?.text}</h2>
            <div className="buttons is-centered mt-4">
              <button className="button is-success is-medium" onClick={() => handleAnswer('yes')}>Yes</button>
              <button className="button is-danger is-medium" onClick={() => handleAnswer('no')}>No</button>
              <button className="button is-warning is-medium" onClick={() => handleAnswer('unknown')}>I don't know</button>
            </div>
            <p className="has-text-centered has-text-grey mt-3">Question {current + 1} of {questions.length}</p>
          </div>

          {yesList.length > 0 && (
            <div className="box mt-5">
              <h3 className="title is-5">Yes examples</h3>
              <div className="columns is-multiline">
                {yesList.slice(0, 3).map((s, idx) => (
                  <div key={idx} className="column is-one-third has-text-centered">
                    <p className="has-text-weight-semibold mb-2">Yes</p>
                    <div className="image-meta">
                      <span className="author">{s.author || '—'}</span>
                      <span className="license">{s.license || '—'}</span>
                    </div>
                    <img src={s.image} alt={s.species} className="crop-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {noList.length > 0 && (
            <div className="box mt-5">
              <h3 className="title is-5">No examples</h3>
              <div className="columns is-multiline">
                {noList.slice(0, 3).map((s, idx) => (
                  <div key={idx} className="column is-one-third has-text-centered">
                    <p className="has-text-weight-semibold mb-2">No</p>
                    <div className="image-meta">
                      <span className="author">{s.author || '—'}</span>
                      <span className="license">{s.license || '—'}</span>
                    </div>
                    <img src={s.image} alt={s.species} className="crop-300" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="box">
          <h2 className="title is-4">{t('identification.pillClams.results')}</h2>
          {matches.length > 0 ? (
            <>
              <p className="has-text-success mb-4">{t('identification.pillClams.possibleMatches')}</p>
              <div className="content">
                <ul>
                    {matches.map((m, idx) => (
                    <li key={idx} className="mb-2" style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ flex: '1 1 auto' }}>
                        <strong style={{ textTransform: 'capitalize' }}>{m.species}</strong>
                        <div className="content is-small" style={{ marginTop: 6 }}>{m.notes || m.description || '—'}</div>
                      </div>
                      {m.image && m.image !== "no image" && (
                        <div style={{ marginLeft: '1rem', maxWidth: 200, textAlign: 'right' }}>
                          <div className="image-meta">
                            <span className="author">{m.author || '—'}</span>
                            <span className="license">{m.license || '—'}</span>
                          </div>
                          <img src={m.image} alt={m.species} className="crop-thumb" style={{ maxWidth: 200 }} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          ) : (
            <p className="has-text-danger">{t('identification.pillClams.noMatches')}</p>
          )}
          <button className="button is-primary mt-4" onClick={resetQuiz}>{t('identification.pillClams.restart')}</button>
        </div>
      )}
    </div>
  );
};

const ExploreSpeciesPage = () => {
  const { t } = useTranslation();
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const supabase = getSupabaseClient();
        if (!supabase) throw new Error('Supabase not configured');
        const { data, error } = await supabase.from('pill_clams').select('*').order('species', { ascending: true });
        if (error) throw error;
        if (!mounted) return;
        setSpeciesList(data || []);
      } catch (err: any) {
        if (!mounted) return;
        console.error('Failed to load species', err);
        setError(err.message || 'Failed to load species');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="box mb-6">
        <h1 className="title is-3">{t('explore.title') || 'Explore species'}</h1>
        <p className="subtitle">{t('explore.subtitle') || 'Click a species to view details'}</p>
      </div>

      {loading ? <div className="box">Loading…</div> : error ? <div className="box has-text-danger">{error}</div> : (
        <div className="columns is-multiline">
          {speciesList.map((s: any) => (
            <div key={s.id} className="column is-one-quarter">
              <div className="card" style={{ cursor: 'pointer' }} onClick={() => setSelected(s)}>
                <div className="card-image">
                  <figure className="image is-4by3">
                    <div className="image-meta">
                      <span className="author">{s.author || '—'}</span>
                      <span className="license">{s.license || '—'}</span>
                    </div>
                    <img src={s.image_url || s.image || 'https://via.placeholder.com/300x200?text=No+image'} alt={s.species} className="crop" />
                  </figure>
                </div>
                <div className="card-content">
                  <p className="title is-6">{s.species}</p>
                  <div className="content is-small" style={{ marginTop: 6 }}>{s.notes || s.description || ''}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className="modal is-active">
          <div className="modal-background" onClick={() => setSelected(null)}></div>
          <div className="modal-card">
            <header className="modal-card-head">
              <p className="modal-card-title">{selected.species}</p>
              <button className="delete" aria-label="close" onClick={() => setSelected(null)}></button>
            </header>
            <section className="modal-card-body">
              <div className="image-meta">
                <span className="author">{selected.author || '—'}</span>
                <span className="license">{selected.license || '—'}</span>
              </div>
              <img src={selected.image_url || selected.image} alt={selected.species} style={{ maxWidth: '100%', borderRadius: 6, objectFit: 'cover', height: 300, width: '100%' }} />
              <div style={{ marginTop: 12 }}>
                <strong>Notes:</strong>
                <div>{selected.notes || selected.description || '—'}</div>
              </div>
            </section>
            <footer className="modal-card-foot">
              <button className="button" onClick={() => setSelected(null)}>Close</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

// Placeholder components for other identification types
const FreshwaterGastropodsIdentificationPage = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-6xl mx-auto">
      <div className="hero is-primary mb-5">
        <div className="hero-body">
          <h1 className="title is-2 has-text-white">{t('identification.freshwaterGastropods.title')}</h1>
          {/* subtitle intentionally removed for identification pages */}
            <p className="subtitle has-text-dark">{t('identification.freshwaterGastropods.subtitle')}</p>
        </div>
      </div>
      <div className="box">
        <p className="has-text-centered">{t('identification.comingSoon')}</p>
      </div>
    </div>
  );
};

const NajadesIdentificationPage = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-6xl mx-auto">
      <div className="hero is-primary mb-5">
        <div className="hero-body">
          <h1 className="title is-2 has-text-white">{t('identification.najades.title')}</h1>
          {/* subtitle intentionally removed for identification pages */}
            <p className="subtitle has-text-dark">{t('identification.najades.subtitle')}</p>
        </div>
      </div>
      <div className="box">
        <p className="has-text-centered">{t('identification.comingSoon')}</p>
      </div>
    </div>
  );
};

const TerrestrialGastropodsIdentificationPage = () => {
  const { t } = useTranslation();
  return (
    <div className="max-w-6xl mx-auto">
      <div className="hero is-primary mb-5">
        <div className="hero-body">
          <h1 className="title is-2 has-text-white">{t('identification.terrestrialGastropods.title')}</h1>
          {/* subtitle intentionally removed for identification pages */}
            <p className="subtitle has-text-dark">{t('identification.terrestrialGastropods.subtitle')}</p>
        </div>
      </div>
      <div className="box">
        <p className="has-text-centered">{t('identification.comingSoon')}</p>
      </div>
    </div>
  );
};

const AboutPage = ({ onNavigate }: any) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ checklists: null, visited_grid_cells: null, total_grid_cells: null });

  useEffect(() => {
    let mounted = true;
    // Attempt to fetch aggregated stats from the API. Endpoint is best-effort — if absent we'll keep placeholders.
    fetch(`${API_BASE}/api/stats/summary`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch stats');
        return res.json();
      })
      .then((data) => {
        if (!mounted) return;
        setStats({
          checklists: data.checklists ?? 0,
          visited_grid_cells: data.visited_grid_cells ?? 0,
          total_grid_cells: data.total_grid_cells ?? 0
        });
      })
      .catch((err) => {
        // Silent fallback — show placeholders in the UI
        console.warn('Could not load stats from API:', err?.message || err);
      });

    return () => { mounted = false; };
  }, []);

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
                  <button className="button is-primary is-medium" onClick={() => onNavigate && onNavigate('register')}>{t('auth.register')}</button>
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
                <div className="value">{stats.checklists !== null ? stats.checklists : '—'}</div>
                <div className="label">{t('about.stats.checklists')}</div>
              </div>

              <div className="stat">
                <div className="value">{stats.visited_grid_cells !== null ? stats.visited_grid_cells : '—'}</div>
                <div className="label">{t('about.stats.visited_grid_cells')}</div>
              </div>

              <div className="stat">
                <div className="value">
                  {stats.total_grid_cells ? `${Math.round(((stats.visited_grid_cells || 0) / stats.total_grid_cells) * 100)}%` : '—'}
                </div>
                <div className="label">{t('about.stats.coverage')}</div>
              </div>
            </div>
          </div>
        </div>
      </section>
      
    </div>
  );
};

const ContactPage = () => {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="title is-3 has-text-weight-bold mb-4">{t('contact.title')}</h1>

      <p className="mb-4">{t('contact.invite')}</p>

      <p>
        <strong>Email:</strong>{' '}
        <a href="mailto:yolan2@outlook.com?subject=Tandonia%20News%20Submission">yolan2@outlook.com</a>
      </p>

      <p className="help-note mt-3">{t('contact.instructions')}</p>
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

const LoginPage = ({ onSuccess }: any) => {
  const auth = React.useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      await auth.login(email, password);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="box">
        <h2 className="title is-4 mb-4">{t('auth.login')}</h2>

        {error && <div className="notification is-danger">{error}</div>}

        <div className="field">
          <label className="label">{t('auth.email')}</label>
          <div className="control">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label">{t('auth.password')}</label>
          <div className="control">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <div className="control">
            <button className="button is-primary" onClick={handleSubmit} disabled={loading}>{loading ? t('auth.processing') : t('auth.login')}</button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RegisterPage = ({ onSuccess }: any) => {
  const auth = React.useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const { t } = useTranslation();

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    try {
      const data = await auth.register(email, password, name);
      if (!data.session) {
        // registration requires email confirmation
        setRegistered(true);
        return;
      }
      if (onSuccess) onSuccess();
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="box">
        <h2 className="title is-4 mb-4">{t('auth.register')}</h2>

        {error && <div className="notification is-danger">{error}</div>}
        {registered && (
          <div className="notification is-info">Registration successful — please check your email to confirm your account before logging in.</div>
        )}

        <div className="field">
          <label className="label">{t('auth.name')}</label>
          <div className="control">
            <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label">{t('auth.email')}</label>
          <div className="control">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <label className="label">{t('auth.password')}</label>
          <div className="control">
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <div className="field">
          <div className="control">
            <button className="button is-primary" onClick={handleSubmit} disabled={loading}>{loading ? t('auth.processing') : t('auth.register')}</button>
          </div>
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

    const map = L.map(mapRef.current).setView([50.5, 4.5], 8);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const gridLayer = L.layerGroup().addTo(map);
    (map as any).gridLayer = gridLayer;
    (map as any).gridCells = [];
    (map as any).markers = [];

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

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (selectedGrid && (map as any).gridLayer) {
      (map as any).gridLayer.clearLayers();
      const cell = (map as any).gridCells.find((c: any) => c.id === selectedGrid);
      if (cell) {
        L.rectangle(cell.bounds, {
          color: '#16a34a',
          weight: 2,
          fillOpacity: 0.3
        }).addTo((map as any).gridLayer);
        map.fitBounds(cell.bounds);
      }
    }
  }, [selectedGrid]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e: any) => {
      if (selectedGrid && mode) {
        const color = mode === 'forest' ? '#22c55e' : mode === 'swamp' ? '#3b82f6' : '#ef4444';
        const marker = L.marker(e.latlng, {
          icon: L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>`
          })
        }).addTo(map);
        (map as any).markers.push(marker);
        onLocationSelect(mode, e.latlng);
      }
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [selectedGrid, mode, onLocationSelect]);

  return <div ref={mapRef} className="w-full h-96 rounded-lg shadow-md"></div>;
};

const ChecklistPage = ({ user }: any) => {
  const { t } = useTranslation();
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
        // Try to fetch species from API first
        const res = await fetch(`${API_BASE}/api/species`);
        if (!res.ok) throw new Error('no-api');
        const data = await res.json();

        // Normalize returned rows to expected shape
        const normalized = (Array.isArray(data) ? data : []).map((r: any, idx: number) => ({
          id: r.id ?? idx + 1,
          scientific_name: r.scientific_name || r.scientificName || r.name || '',
          dutch_name: r.dutch_name || r.dutchName || r.common_name || null,
          observation_count: parseInt(r.observation_count ?? r.count ?? 0, 10)
        }));

        // Sort by observation_count desc
        normalized.sort((a: any, b: any) => (b.observation_count || 0) - (a.observation_count || 0));

        setSpeciesList(normalized);

        // Initialize species counts keyed by returned id
        const initialCounts = normalized.reduce((acc: any, sp: any) => ({ ...acc, [sp.id]: 0 }), {});
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
      alert('Please enter time spent searching in minutes');
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
                  <label className="label">Time Spent searching (minutes)</label>
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
  // navigation state handles SPA pages, including auth pages
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [identifyDropdownOpen, setIdentifyDropdownOpen] = useState(false);
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
                <a className={`navbar-item ${currentPage === 'explore' ? 'is-active' : ''}`} onClick={() => setCurrentPage('explore')}>Explore species</a>
                
                <div className={`navbar-item has-dropdown ${identifyDropdownOpen ? 'is-active' : ''}`} onMouseEnter={() => setIdentifyDropdownOpen(true)} onMouseLeave={() => setIdentifyDropdownOpen(false)}>
                  <a className="navbar-link">
                    {t('nav.identify')}
                  </a>
                  <div className="navbar-dropdown">
                    <a className="navbar-item" onClick={() => { setCurrentPage('identify-freshwater-gastropods'); setIdentifyDropdownOpen(false); }}>
                      {t('identification.freshwaterGastropodsMenu')}
                    </a>
                    <a className="navbar-item" onClick={() => { setCurrentPage('identify-pill-clams'); setIdentifyDropdownOpen(false); }}>
                      {t('identification.pillClamsMenu')}
                    </a>
                    <a className="navbar-item" onClick={() => { setCurrentPage('identify-najades'); setIdentifyDropdownOpen(false); }}>
                      {t('identification.najadesMenu')}
                    </a>
                    <a className="navbar-item" onClick={() => { setCurrentPage('identify-terrestrial-gastropods'); setIdentifyDropdownOpen(false); }}>
                      {t('identification.terrestrialGastropodsMenu')}
                    </a>
                  </div>
                </div>

                <a className={`navbar-item ${currentPage === 'checklist' ? 'is-active' : ''}`} onClick={() => setCurrentPage('checklist')}>{t('nav.checklist')}</a>
                <a className={`navbar-item ${currentPage === 'contact' ? 'is-active' : ''}`} onClick={() => setCurrentPage('contact')}>{t('nav.contact')}</a>
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
                          <button className="button is-link" onClick={() => setCurrentPage('login')}><LogIn size={16} style={{ marginRight: 8 }} />{t('nav.login')}</button>
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
            {currentPage === 'about' && <AboutPage onNavigate={setCurrentPage} />}
            {currentPage === 'checklist' && <ChecklistPage user={auth.user} />}
            {currentPage === 'contact' && <ContactPage />}
            {currentPage === 'explore' && <ExploreSpeciesPage />}
            {currentPage === 'identify-freshwater-gastropods' && <FreshwaterGastropodsIdentificationPage />}
            {currentPage === 'identify-pill-clams' && <PillClamsIdentificationPage />}
            {currentPage === 'identify-najades' && <NajadesIdentificationPage />}
            {currentPage === 'identify-terrestrial-gastropods' && <TerrestrialGastropodsIdentificationPage />}
            {currentPage === 'login' && <LoginPage onSuccess={() => setCurrentPage('news')} />}
            {currentPage === 'register' && <RegisterPage onSuccess={() => setCurrentPage('news')} />}
          </div>
        </section>

      </div>
    </AuthContext.Provider>
  );
};

export default App;




