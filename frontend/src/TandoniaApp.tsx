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

const FRONTEND_URL = (typeof window !== 'undefined' && window.location?.origin)
  || (typeof document !== 'undefined' && document.baseURI)
  || 'https://tandonia.be';

const useAuth = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    supabase.auth.getSession()
      .then(({ data }) => {
        if (isMounted) setUser(data?.session?.user ?? null);
      })
      .catch((err) => console.warn('getSession failed', err))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) setUser(session?.user ?? null);
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const logout = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  const register = async (email: string, password: string, name: string) => {
    const supabase = getSupabaseClient();
    if (!supabase) throw new Error('Supabase not configured');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: FRONTEND_URL
      }
    });
    if (error) throw error;

    if (data?.session?.access_token && data.user) {
      try {
        await fetch(`${API_BASE}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session.access_token}`
          },
          body: JSON.stringify({
            email: data.user.email,
            name
          })
        });
      } catch (syncError) {
        console.error('Auth sync failed', syncError);
      }
    }

    return data;
  };

  const getAccessToken = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token ?? null;
    // DEBUG: show whether a token was found (do not log token value)
    try { console.debug('getAccessToken token present:', !!token, 'length:', token ? token.length : 0); } catch (e) {}
    return token;
  };

  return { user, login, logout, register, loading, getAccessToken };
};

const ImageCredit = ({ author, license }: { author?: string | null; license?: string | null }) => (
  <div className="image-credit-overlay">
    <span className="author">{author || 'Unknown author'}</span>
    {license ? <span className="license">{license}</span> : null}
  </div>
);

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
              <figure className="figure-credit-wrapper">
                <ImageCredit
                  author={item.author || null}
                  license={item.license ? t('news.license', { license: item.license }) : null}
                />
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

  const normalize = (value: any, key: string) => {
    if (typeof value === 'string') {
      value = value.toLowerCase();
      // Handle specific keys
      if (key === "c4_shape") {
        if (value.includes("straight") || value.includes("slightly")) return "yes";
        return "no";
      }
      if (key === "c2_shape") {
        if (value.includes("strong")) return "yes";
        return "no";
      }
      if (key === "striation_regular") {
        if (value.includes("regular")) return "yes";
        return "no";
      }
      if (key === "ligament_long") {
        if (value.includes("long")) return "yes";
        return "no";
      }
      if (key === "umbo_taal") {
        if (value.includes("clearly")) return "yes";
        return "no";
      }
      if (key === "ligamentpit_shape") {
        if (value.includes("curved")) return "yes";
        return "no";
      }
      // For yes/no questions
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
        const t = normalize((s as any)[q.key], q.key);
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
    normalize((s as any)[question.key], question.key) === "yes" && s.image && s.image !== "no image"
  ) : [];
  const noList = question ? species.filter(s =>
    normalize((s as any)[question.key], question.key) === "no" && s.image && s.image !== "no image"
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
                    <div className="figure-credit-wrapper">
                      <ImageCredit author={s.author} license={s.license} />
                      <img src={s.image} alt={s.species} className="crop-300" />
                    </div>
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
                    <div className="figure-credit-wrapper">
                      <ImageCredit author={s.author} license={s.license} />
                      <img src={s.image} alt={s.species} className="crop-300" />
                    </div>
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
                          <div className="figure-credit-wrapper">
                            <ImageCredit author={m.author} license={m.license} />
                            <img src={m.image} alt={m.species} className="crop-thumb" style={{ maxWidth: 200 }} />
                          </div>
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
                    <figure className="image is-4by3 figure-credit-wrapper">
                      <ImageCredit author={s.author} license={s.license} />
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
              <div className="figure-credit-wrapper" style={{ marginBottom: 12 }}>
                <ImageCredit author={selected.author} license={selected.license} />
                <img src={selected.image_url || selected.image} alt={selected.species} style={{ maxWidth: '100%', borderRadius: 6, objectFit: 'cover', height: 300, width: '100%' }} />
              </div>
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

const HABITAT_COLORS: Record<string, string> = {
  swamp: '#0ea5e9',
  urban: '#f97316',
  forest: '#16a34a'
};

const Map = ({ onGridSelect, selectedGrid, onLocationSelect, mode, placedLocations }: any) => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const gridSelectRef = useRef(onGridSelect);
  const selectedGridRef = useRef(selectedGrid);
  const selectedCellRef = useRef<any>(null);

  useEffect(() => {
    gridSelectRef.current = onGridSelect;
  }, [onGridSelect]);

  useEffect(() => {
    selectedGridRef.current = selectedGrid;
  }, [selectedGrid]);

  const applyGridHighlight = (targetId: any) => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const gridLayer = (map as any).gridLayer;
    const highlightLayer = (map as any).highlightLayer;
    if (!gridLayer) return;
    const cells = (map as any).gridCells || [];
    selectedCellRef.current = null;
    if (highlightLayer) highlightLayer.clearLayers();

    if (!targetId) {
      cells.forEach((cell: any) => {
        if (!gridLayer.hasLayer(cell.layer)) gridLayer.addLayer(cell.layer);
        if (cell.layer?.setStyle) {
          cell.layer.setStyle({ color: '#15803d', weight: 1, fillOpacity: 0.08 });
        }
      });
      return;
    }

    cells.forEach((cell: any) => {
      const isSelected = cell.id === targetId;
      if (isSelected) {
        selectedCellRef.current = cell;
        if (!gridLayer.hasLayer(cell.layer)) gridLayer.addLayer(cell.layer);
        if (cell.layer?.setStyle) {
          cell.layer.setStyle({ color: '#16a34a', weight: 2, fillOpacity: 0.25 });
        }
      } else if (gridLayer.hasLayer(cell.layer)) {
        gridLayer.removeLayer(cell.layer);
      }
    });

    if (selectedCellRef.current) {
      map.fitBounds(selectedCellRef.current.layer.getBounds(), { padding: [20, 20] });
    }
  };

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current).setView([50.5, 4.5], 8);
    mapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    const gridLayer = L.layerGroup().addTo(map);
    const highlightLayer = L.layerGroup().addTo(map);
    (map as any).gridLayer = gridLayer;
    (map as any).highlightLayer = highlightLayer;
    (map as any).gridCells = [];

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

    let isMounted = true;
    const controller = new AbortController();

    const loadGridCells = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/grid-cells`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to load grid cells (${response.status})`);
        }
        const geojson = await response.json();
        if (!isMounted) return;

        const gridLayer = (map as any).gridLayer;
        if (!gridLayer) return;

        gridLayer.clearLayers();
        const collected: any[] = [];

        L.geoJSON(geojson, {
          style: (feature: any) => {
            const count = feature?.properties?.checklist_count ?? feature?.properties?.checklistCount ?? 0;
            const hasChecklist = !!count || feature?.properties?.has_checklist;
            return {
              color: hasChecklist ? '#16a34a' : '#15803d',
              weight: 1,
              fillOpacity: hasChecklist ? 0.16 : 0.08
            };
          },
          onEachFeature: (feature: any, layer: any) => {
            const cellId = feature?.id
              ?? feature?.properties?.id
              ?? feature?.properties?.grid_id
              ?? feature?.properties?.name;
            if (!cellId) return;
            const bounds = layer.getBounds();
            const entry = { id: cellId, bounds, layer };
            collected.push(entry);
            layer.on('click', () => {
              const handler = gridSelectRef.current;
              if (handler) handler(cellId);
            });
            // Add a tooltip showing checklist count if present
            const count = feature?.properties?.checklist_count ?? feature?.properties?.checklistCount ?? 0;
            if (count) {
              layer.bindTooltip(`Has ${count} checklist(s)`, { permanent: false });
            }
          }
        }).addTo(gridLayer);

        (map as any).gridCells = collected;
        // Some Leaflet LayerGroup instances do not implement bringToFront directly.
        // Safely call bringToFront on the container if available, otherwise call it on each sub-layer.
        try {
          if (typeof (gridLayer as any).bringToFront === 'function') {
            (gridLayer as any).bringToFront();
          } else if (typeof (gridLayer as any).eachLayer === 'function') {
            (gridLayer as any).eachLayer((layer: any) => {
              if (layer && typeof layer.bringToFront === 'function') layer.bringToFront();
            });
          }
        } catch (err) {
          console.warn('Error while bringing grid layer to front:', err);
        }
        applyGridHighlight(selectedGridRef.current);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Failed to load grid cells', err);
      }
    };

    loadGridCells();

    return () => {
      isMounted = false;
      controller.abort();
      if ((map as any).gridLayer) {
        (map as any).gridLayer.clearLayers();
      }
      (map as any).gridCells = [];
    };
  }, []);

  useEffect(() => {
    applyGridHighlight(selectedGrid);
  }, [selectedGrid]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    let markersLayer = (map as any).markersLayer;
    if (!markersLayer) {
      markersLayer = L.layerGroup().addTo(map);
      (map as any).markersLayer = markersLayer;
    }
    markersLayer.clearLayers();
    if (!placedLocations) return;
    Object.entries(placedLocations).forEach(([key, coords]: any) => {
      if (!coords) return;
      const lat = typeof coords.lat === 'function' ? coords.lat() : coords.lat;
      const lng = typeof coords.lng === 'function' ? coords.lng() : coords.lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const color = HABITAT_COLORS[key] || '#2563eb';
      L.marker({ lat, lng }, {
        icon: L.divIcon({
          className: 'custom-marker',
          html: `<div style="background-color:${color};width:20px;height:20px;border-radius:50%;border:2px solid white;"></div>`
        })
      }).addTo(markersLayer);
    });
  }, [placedLocations]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const handleClick = (e: any) => {
      if (!selectedGrid || !mode) return;
      const cell = selectedCellRef.current;
      if (cell?.layer && !cell.layer.getBounds().contains(e.latlng)) {
        alert('Please click inside the selected grid cell.');
        return;
      }
      onLocationSelect(mode, e.latlng);
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [selectedGrid, mode, onLocationSelect]);

  return <div ref={mapRef} className="leaflet-map"></div>;
};

const HABITAT_STEPS = [
  { key: 'swamp', label: 'Swamp', description: 'Wet habitat sample' },
  { key: 'urban', label: 'Urban', description: 'Urban/anthropogenous area' },
  { key: 'forest', label: 'Forest', description: 'Forest habitat sample' }
];

const ChecklistPage = ({ user }: any) => {
  const { t } = useTranslation();
  const [selectedGrid, setSelectedGrid] = useState<any>(null);
  const [locations, setLocations] = useState<any>({
    forest: null,
    swamp: null,
    urban: null
  });
  const [overrideHabitat, setOverrideHabitat] = useState<string | null>(null);
  const nextHabitatKey = React.useMemo(() => {
    const step = HABITAT_STEPS.find((item) => !locations[item.key]);
    return step ? step.key : null;
  }, [locations]);
  const activeHabitat = overrideHabitat || (selectedGrid ? nextHabitatKey : null);
  const activeHabitatStep = React.useMemo(
    () => HABITAT_STEPS.find((item) => item.key === activeHabitat) || null,
    [activeHabitat]
  );
  const [speciesList, setSpeciesList] = useState<any[]>([]);
  const [species, setSpecies] = useState<any>({});
  const [timeSpent, setTimeSpent] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [speciesError, setSpeciesError] = useState<string | null>(null);
  const [gridCells, setGridCells] = useState<any[]>([]);
  const [gridCellsLoading, setGridCellsLoading] = useState(true);
  const [gridCellsError, setGridCellsError] = useState<string | null>(null);
  const searchInputId = 'species-search-input';
  const timeSpentInputId = 'time-spent-input';
  const gridCellSelectId = 'grid-cell-select';
  const resetLocations = React.useCallback(() => {
    setLocations({ forest: null, swamp: null, urban: null });
    setOverrideHabitat(null);
  }, []);
  const formatCoords = (coords: any) => {
    if (!coords) return 'Not set';
    const latValue = typeof coords.lat === 'function' ? coords.lat() : coords.lat;
    const lngValue = typeof coords.lng === 'function' ? coords.lng() : coords.lng;
    if (typeof latValue !== 'number' || typeof lngValue !== 'number') return 'Not set';
    return `${latValue.toFixed(4)}, ${lngValue.toFixed(4)}`;
  };
  const handleEditHabitat = (key: string) => {
    if (!selectedGrid) return;
    setOverrideHabitat(key);
  };

  // Access auth helpers from context instead of calling hooks inside handlers
  const auth = React.useContext(AuthContext);

  // Fetch species list from API
  useEffect(() => {
    let mounted = true;
    const fetchSpecies = async () => {
      setSpeciesError(null);
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/species`);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          const msg = text || `Request failed with status ${res.status}`;
          throw new Error(msg);
        }
        const data = await res.json();
        if (!mounted) return;

        const normalized = (Array.isArray(data) ? data : []).map((r: any, idx: number) => ({
          id: r.id ?? idx + 1,
          scientific_name: r.scientific_name || r.scientificName || r.name || '',
          dutch_name: r.dutch_name || r.dutchName || r.common_name || null,
          observation_count: parseInt(r.observation_count ?? r.count ?? 0, 10)
        }));

        normalized.sort((a: any, b: any) => (b.observation_count || 0) - (a.observation_count || 0));

        setSpeciesList(normalized);
        const initialCounts = normalized.reduce((acc: any, sp: any) => ({ ...acc, [sp.id]: 0 }), {});
        setSpecies(initialCounts);
      } catch (error: any) {
        if (!mounted) return;
        console.error('Error fetching species:', error);
        setSpeciesList([]);
        setSpeciesError(error?.message || 'Failed to load species');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchSpecies();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadGridCells = async () => {
      setGridCellsLoading(true);
      setGridCellsError(null);
      try {
        const res = await fetch(`${API_BASE}/api/grid-cells`);
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `Request failed with status ${res.status}`);
        }
        const payload = await res.json();
        if (!mounted) return;
        const features = Array.isArray(payload?.features) ? payload.features : Array.isArray(payload) ? payload : [];
        const normalized = features.map((feature: any, idx: number) => {
          const id = feature?.id
            ?? feature?.properties?.id
            ?? feature?.properties?.grid_id
            ?? feature?.properties?.name
            ?? `cell-${idx}`;
          const label = feature?.properties?.name
            || feature?.properties?.grid_id
            || feature?.properties?.code
            || `Grid ${id}`;
          return { id, label };
        });
        setGridCells(normalized);
      } catch (err: any) {
        if (!mounted) return;
        console.error('Failed to load grid cells list:', err);
        setGridCellsError(err?.message || 'Failed to load grid cells');
        setGridCells([]);
      } finally {
        if (mounted) setGridCellsLoading(false);
      }
    };

    loadGridCells();
    return () => { mounted = false; };
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

  const handleGridSelect = (gridId: any) => {
    if (!gridId) return;
    if (selectedGrid && gridId !== selectedGrid) {
      resetLocations();
    }
    setSelectedGrid(gridId);
  };

  const handleLocationSelect = (type: any, latlng: any) => {
    if (!type) return;
    setLocations((prev: any) => ({ ...prev, [type]: latlng }));
    setOverrideHabitat(null);
  };

  const handleSubmit = async () => {
    if (!selectedGrid) {
      alert('Please select a grid cell');
      return;
    }

    if (!locations.swamp || !locations.urban || !locations.forest) {
      alert('Please capture swamp, urban, and forest locations within the selected grid cell.');
      return;
    }

    if (!timeSpent || parseInt(timeSpent) < 1) {
      alert('Please enter time spent searching in minutes');
      return;
    }

    const checklistData = {
      userId: user.id,
      gridCellId: selectedGrid,
      locations: {
        forest: locations.forest,
        swamp: locations.swamp,
        urban: locations.urban,
        anthropogenous: locations.urban
      },
      species,
      timeSpent: parseInt(timeSpent),
      timestamp: new Date().toISOString()
    };

    try {
      // Get access token from Auth context (provided by App)
      const token = auth && auth.getAccessToken ? await auth.getAccessToken() : null;

      // Client-side check: ensure we have a token before submitting and give helpful guidance
      if (!token) {
        console.error('Checklist submit failed: no access token present. Please login again.');
        alert('No access token found — please log out and login again (or try refreshing the page).');
        return;
      }
      try { console.debug('Submitting checklist with token length:', token ? token.length : 0); } catch (_) {}
      
      const response = await fetch(`${API_BASE}/api/checklists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(checklistData)
      });
      
      if (!response.ok) {
        // Try to parse server JSON for better error details, fallback to text
        let msg = '';
        try {
          const errJson = await response.json();
          msg = errJson?.error || errJson?.message || errJson?.hint || errJson?.detail || JSON.stringify(errJson);
        } catch (e) {
          msg = await response.text().catch(() => '');
        }
        throw new Error(msg || `Submission failed (${response.status})`);
      }

      const json = await response.json().catch(() => null);
      setSubmitMessage(json?.message || null);
      setSubmitted(true);
      setTimeout(() => {
        setSelectedGrid(null);
        resetLocations();
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
        {submitMessage ? <p className="text-gray-600 mb-2">{submitMessage}</p> : null}
        <p className="text-gray-600">Thank you for your contribution</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
  <h1 className="title is-3 has-text-weight-bold mb-4">{t('checklist.title')}</h1>
      <p className="help-note mb-4">Follow the steps: pick a grid cell, place swamp → urban → forest locations inside it, then record species counts.</p>

      <div className="checklist-container">
        <div className="checklist-left">
          <div className="map-card">
            <h3 className="is-size-5 has-text-weight-semibold mb-3">{selectedGrid ? t('checklist.add_locations') : t('checklist.step1')}</h3>
            <div className="field">
              <label className="label" htmlFor={gridCellSelectId}>Selecteer een gridcel</label>
              {gridCellsLoading ? (
                <p className="help-note">Gridcellen laden…</p>
              ) : gridCellsError ? (
                <div className="notification is-danger" role="alert">{gridCellsError}</div>
              ) : (
                <div className="select is-fullwidth">
                  <select
                    id={gridCellSelectId}
                    value={selectedGrid || ''}
                    onChange={(e) => handleGridSelect(e.target.value || null)}
                  >
                    <option value="" disabled>{t('checklist.step1') || 'Choose a grid cell'}</option>
                    {gridCells.map((cell) => (
                      <option key={cell.id} value={cell.id}>{cell.label}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <Map 
              onGridSelect={handleGridSelect} 
              selectedGrid={selectedGrid}
              onLocationSelect={handleLocationSelect}
              mode={activeHabitat}
              placedLocations={locations}
            />

            {selectedGrid ? (
              <div className="grid-guidance">
                <div className="mb-2">
                  <strong>Selected grid:</strong> {selectedGrid}
                </div>
                <div className="habitat-steps">
                  {HABITAT_STEPS.map((step) => {
                    const done = Boolean(locations[step.key]);
                    const isActive = activeHabitat === step.key;
                    return (
                      <div key={step.key} className={`habitat-step ${done ? 'completed' : isActive ? 'active' : ''}`}>
                        <div className="habitat-step-header">
                          <span>{step.label}</span>
                          {done && (
                            <button className="button is-text is-small" onClick={() => handleEditHabitat(step.key)}>
                              Reposition
                            </button>
                          )}
                        </div>
                        <div className="habitat-step-body">
                          {done ? (
                            <span className="coords">{formatCoords(locations[step.key])}</span>
                          ) : isActive ? (
                            <span>Click on the map to place this location.</span>
                          ) : (
                            <span>Waiting…</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="help-note mt-2">
                  {activeHabitatStep
                    ? `Currently placing the ${activeHabitatStep.label.toLowerCase()} location. Click inside the selected grid cell.`
                    : 'All habitat locations captured. Use “Reposition” to adjust any point.'}
                </p>
                <div className="buttons mt-2">
                  <button className="button is-light is-small" onClick={resetLocations}>Reset locations</button>
                </div>
              </div>
            ) : (
              <p className="help-note mt-3">Select a grid cell to begin placing habitat locations.</p>
            )}
          </div>
        </div>

        <div className="checklist-right">
          <div className="box">
            <h3 className="is-size-5 has-text-weight-semibold mb-3">{t('checklist.step3')}</h3>
            {loading ? (
              <div className="has-text-centered py-6">Loading species...</div>
            ) : speciesError ? (
              <div className="notification is-danger" role="alert">{speciesError}</div>
            ) : (
              <>
                <div className="field">
                  <label className="label sr-only" htmlFor={searchInputId}>{t('checklist.searchLabel') || 'Search species'}</label>
                  <div className="control">
                    <input
                      id={searchInputId}
                      name="speciesSearch"
                      className="input"
                      type="text"
                      placeholder="Zoek op Nederlandse of Latijnse naam..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
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
                          <div className="name" id={`species-label-${sp.id}`}>{sp.dutch_name}</div>
                          <div className="is-size-7 has-text-grey">{sp.scientific_name} · {sp.observation_count} waarnemingen</div>
                        </div>
                        <div>
                          <label className="sr-only" htmlFor={`species-count-${sp.id}`}>
                            {`Aantal voor ${sp.dutch_name || sp.scientific_name}`}
                          </label>
                          <input
                            id={`species-count-${sp.id}`}
                            name={`speciesCount-${sp.id}`}
                            className="input"
                            type="number"
                            min="0"
                            aria-labelledby={`species-label-${sp.id}`}
                            value={species[sp.id] || 0}
                            onChange={(e) => setSpecies((prev: any) => ({ ...prev, [sp.id]: parseInt(e.target.value) || 0 }))}
                          />
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="field mt-4">
                  <label className="label" htmlFor={timeSpentInputId}>Time Spent searching (minutes)</label>
                  <div className="control">
                    <input
                      id={timeSpentInputId}
                      name="timeSpent"
                      className="input"
                      type="number"
                      min="1"
                      value={timeSpent}
                      onChange={(e) => setTimeSpent(e.target.value)}
                    />
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




