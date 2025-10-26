import { useState, useEffect } from 'react';
import { ShoppingCart, Database, Zap, FileText, TrendingUp, Activity } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'https://crime-lab-worker.bedwards.workers.dev';

function App() {
  const [cases, setCases] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('cases');
  const [dbMetrics, setDbMetrics] = useState({});
  const [liveConnections, setLiveConnections] = useState(0);
  const [activities, setActivities] = useState([]);
  const [mongoAnalytics, setMongoAnalytics] = useState(null);

  // Fetch initial data
  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE}/cases`).then(r => r.json()),
      fetch(`${API_BASE}/evidence`).then(r => r.json()),
      fetch(`${API_BASE}/metrics`).then(r => r.json()),
    ])
      .then(([casesData, evidenceData, metricsData]) => {
        setCases(casesData);
        setEvidence(evidenceData);
        setDbMetrics(metricsData);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load data:', err);
        setLoading(false);
      });
  }, []);

  // Fetch MongoDB analytics every 5 seconds when on internals view
  useEffect(() => {
    if (activeView !== 'internals') return;

    const fetchAnalytics = async () => {
      try {
        const response = await fetch(`${API_BASE}/activity/analytics`);
        const data = await response.json();
        setMongoAnalytics(data);
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
      }
    };

    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 5000);
    return () => clearInterval(interval);
  }, [activeView]);

  // SSE stream for live activity
  useEffect(() => {
    if (activeView !== 'internals') return;

    const eventSource = new EventSource(`${API_BASE}/activity/stream`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'connection_count') {
        setLiveConnections(data.count);
      } else if (data.type !== 'connected') {
        setActivities(prev => [data, ...prev].slice(0, 20));
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [activeView]);

  // Log activity to MongoDB
  const logActivity = async (type, data) => {
    try {
      await fetch(`${API_BASE}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          data: {
            ...data,
            session_id: sessionStorage.getItem('session_id') || (() => {
              const id = crypto.randomUUID();
              sessionStorage.setItem('session_id', id);
              return id;
            })()
          }
        })
      });
    } catch (err) {
      console.error('Failed to log activity:', err);
    }
  };

  const addToCart = (evidenceItem) => {
    setCart(prev => [...prev, evidenceItem]);
    logActivity('cart_add', { evidence_id: evidenceItem.id });
  };

  const removeFromCart = (evidenceId) => {
    setCart(prev => prev.filter(item => item.id !== evidenceId));
    logActivity('cart_remove', { evidence_id: evidenceId });
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;

    const variant_ids = cart.map(item => item.variant_id);
    const case_ids = getEligibleCases();

    try {
      const response = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_ids, case_ids }),
      });

      const data = await response.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    } catch (err) {
      console.error('Checkout failed:', err);
    }
  };

  const getEligibleCases = () => {
    const cartIds = new Set(cart.map(e => e.id));
    return cases
      .filter(c => !c.solved_at && c.required_evidence?.every(id => cartIds.has(id)))
      .map(c => c.id);
  };

  const CasesView = () => (
    <div className="space-y-6">
      {cases.map(caseItem => {
        const collectedEvidence = caseItem.required_evidence?.filter(id =>
          cart.some(item => item.id === id)
        ) || [];
        const progress = caseItem.required_evidence
          ? (collectedEvidence.length / caseItem.required_evidence.length) * 100
          : 0;

        return (
          <div
            key={caseItem.id}
            className={`bg-white rounded-2xl border-2 p-6 shadow-lg hover:shadow-xl transition-all duration-200 ${caseItem.solved_at ? 'border-green-400 bg-green-50' : 'border-blue-400'
              }`}
            onClick={() => logActivity('case_viewed', { case_id: caseItem.id })}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-slate-800 mb-1">{caseItem.title}</h3>
                <div className="text-sm text-slate-500 font-mono">{caseItem.number}</div>
              </div>
              {caseItem.solved_at && (
                <span className="px-4 py-2 bg-green-500 text-white text-sm font-bold rounded-full">
                  SOLVED ✓
                </span>
              )}
            </div>

            <p className="text-slate-700 mb-4">{caseItem.description}</p>

            {!caseItem.solved_at && (
              <>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-600">Evidence Collected:</span>
                  <span className="font-bold text-blue-600">
                    {collectedEvidence.length} / {caseItem.required_evidence?.length || 0}
                  </span>
                </div>
                <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </>
            )}

            {caseItem.solved_at && (
              <div className="mt-4 bg-white/80 border-2 border-green-300 rounded-xl p-4">
                <div className="text-sm text-green-700 mb-1 font-semibold">SOLUTION:</div>
                <div className="text-slate-800">{caseItem.solution}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const EvidenceView = () => {
    const eligibleCaseIds = getEligibleCases();

    return (
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {evidence.map(item => {
            const inCart = cart.some(c => c.id === item.id);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border-2 border-slate-300 p-5 shadow-md hover:shadow-xl transition-all duration-200 hover:-translate-y-1"
              >
                <h3 className="text-lg font-bold text-slate-800 mb-2">{item.name}</h3>
                <p className="text-sm text-slate-600 mb-4 line-clamp-2">{item.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold text-blue-600">${item.price}</span>
                  <button
                    onClick={() => inCart ? removeFromCart(item.id) : addToCart(item)}
                    className={`px-4 py-2 rounded-lg font-semibold transition-colors ${inCart
                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                  >
                    {inCart ? 'Remove' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Cart Summary */}
        {cart.length > 0 && (
          <div className="fixed bottom-6 right-6 bg-white rounded-2xl border-2 border-blue-400 p-6 shadow-2xl max-w-md">
            <div className="flex items-center gap-3 mb-4">
              <ShoppingCart size={24} className="text-blue-600" />
              <h3 className="text-xl font-bold">Cart ({cart.length} items)</h3>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto mb-4">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-sm py-2 border-b">
                  <span>{item.name}</span>
                  <span className="font-bold">${item.price}</span>
                </div>
              ))}
            </div>

            <div className="border-t-2 pt-4 mb-4">
              <div className="flex justify-between text-lg font-bold">
                <span>Total:</span>
                <span className="text-blue-600">
                  ${cart.reduce((sum, item) => sum + parseFloat(item.price), 0).toFixed(2)}
                </span>
              </div>
            </div>

            {eligibleCaseIds.length > 0 && (
              <div className="bg-green-100 border border-green-300 rounded-lg p-3 mb-4">
                <div className="text-sm text-green-800 font-semibold mb-1">
                  ✓ Will solve {eligibleCaseIds.length} case(s)
                </div>
                <div className="text-xs text-green-700">
                  Purchase to automatically mark cases as solved
                </div>
              </div>
            )}

            <button
              onClick={handleCheckout}
              className="w-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white py-3 rounded-xl font-bold hover:from-blue-700 hover:to-cyan-700 transition-all duration-200 shadow-lg"
            >
              Purchase Evidence
            </button>
          </div>
        )}
      </div>
    );
  };

  const InternalsView = () => (
    <div className="space-y-6">
      {/* Neon Postgres Metrics */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-100 border-2 border-blue-300 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-blue-900">
          <Database size={24} />
          Database Metrics (Neon Postgres)
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4">
            <div className="text-sm text-blue-700 mb-1">Total Cases</div>
            <div className="text-3xl font-bold text-blue-900">{dbMetrics.total_cases || 0}</div>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4">
            <div className="text-sm text-green-700 mb-1">Solved Cases</div>
            <div className="text-3xl font-bold text-green-700">{dbMetrics.solved_cases || 0}</div>
          </div>
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4">
            <div className="text-sm text-purple-700 mb-1">Evidence Items</div>
            <div className="text-3xl font-bold text-purple-700">{dbMetrics.evidence_count || 0}</div>
          </div>
        </div>
      </div>

      {/* MongoDB Live Activity */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-100 border-2 border-purple-300 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-900">
          <Zap size={24} />
          Live Activity Stream (MongoDB SSE)
        </h3>
        <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 mb-4">
          <div className="text-sm text-purple-700 mb-1">Active Sessions (Last 30s)</div>
          <div className="text-4xl font-bold text-purple-800 flex items-center gap-2">
            {liveConnections}
            <span className="w-3 h-3 bg-purple-500 rounded-full animate-pulse"></span>
          </div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activities.map((activity, i) => (
            <div key={i} className="bg-white/80 backdrop-blur-sm p-3 rounded-xl text-xs font-mono border border-purple-200">
              <span className="text-purple-600">{new Date(activity.timestamp).toLocaleTimeString()}</span>
              {' · '}
              <span className="font-semibold text-purple-900">{activity.type}</span>
              {activity.data?.case_id && <span className="text-purple-700"> · Case {activity.data.case_id}</span>}
              {activity.data?.evidence_id && <span className="text-purple-700"> · {activity.data.evidence_id}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* MongoDB Analytics */}
      {mongoAnalytics && (
        <>
          {/* Top Cases */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-100 border-2 border-emerald-300 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-emerald-900">
              <TrendingUp size={24} />
              Top Cases (Last 24h) - MongoDB Aggregation
            </h3>
            <div className="space-y-2">
              {mongoAnalytics.top_cases?.length > 0 ? (
                mongoAnalytics.top_cases.map((item, i) => (
                  <div key={i} className="bg-white/80 backdrop-blur-sm p-4 rounded-xl border border-emerald-200 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-emerald-900">Case {item.case_id}</div>
                      <div className="text-xs text-emerald-700">
                        Last viewed: {new Date(item.last_viewed).toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-emerald-600">{item.views} views</div>
                  </div>
                ))
              ) : (
                <div className="text-center text-emerald-700 py-4">No case views yet</div>
              )}
            </div>
          </div>

          {/* Evidence Heatmap */}
          <div className="bg-gradient-to-br from-orange-50 to-amber-100 border-2 border-orange-300 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-orange-900">
              <Activity size={24} />
              Evidence Engagement Heatmap - MongoDB Aggregation
            </h3>
            <div className="space-y-2">
              {mongoAnalytics.top_evidence?.length > 0 ? (
                mongoAnalytics.top_evidence.map((item, i) => {
                  const maxAdds = Math.max(...mongoAnalytics.top_evidence.map(e => e.cart_adds));
                  const widthPercent = (item.cart_adds / maxAdds) * 100;
                  return (
                    <div key={i} className="bg-white/80 backdrop-blur-sm p-3 rounded-xl border border-orange-200">
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold text-orange-900">{item.evidence_id}</span>
                        <span className="text-orange-700 font-bold">{item.cart_adds} adds</span>
                      </div>
                      <div className="h-2 bg-orange-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-orange-500 to-amber-500"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-orange-700 py-4">No cart activity yet</div>
              )}
            </div>
          </div>

          {/* Activity Type Breakdown */}
          <div className="bg-gradient-to-br from-rose-50 to-pink-100 border-2 border-rose-300 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-rose-900">
              <Activity size={24} />
              Activity Type Breakdown (24h) - MongoDB Aggregation
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {mongoAnalytics.activity_types?.map((item, i) => (
                <div key={i} className="bg-white/80 backdrop-blur-sm rounded-xl p-4 border border-rose-200">
                  <div className="text-xs text-rose-700 mb-1 uppercase">{item.type}</div>
                  <div className="text-3xl font-bold text-rose-800">{item.count}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Shopify Integration */}
      <div className="bg-gradient-to-br from-amber-50 to-yellow-100 border-2 border-amber-300 rounded-2xl p-6 shadow-xl">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-amber-900">
          <FileText size={24} />
          Shopify Integration
        </h3>
        <div className="space-y-3 bg-white/70 backdrop-blur-sm rounded-xl p-4">
          <div className="flex justify-between items-center">
            <span className="text-amber-800">Storefront API:</span>
            <span className="px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full">CONNECTED</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-amber-800">Products Synced:</span>
            <span className="font-bold text-amber-900">{evidence.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-amber-800">Cache Strategy:</span>
            <span className="font-mono text-xs text-amber-700">Edge w/ 5min TTL</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">🔬</div>
          <div className="text-3xl font-bold text-white">Loading Crime Lab...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-50">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDUpIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative max-w-7xl mx-auto p-8">
          <div className="flex items-center gap-4 mb-3">
            <div className="text-6xl">🔬</div>
            <div>
              <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-cyan-200 to-teal-200 leading-tight">
                Imaginary Crime Lab
              </h1>
              <p className="text-cyan-200 text-lg mt-2">Cases solve themselves when you collect all the evidence</p>
            </div>
          </div>
          <div className="mt-6 text-xs text-cyan-300/70 font-mono bg-black/20 backdrop-blur-sm rounded-lg px-4 py-2 inline-block">
            React → Workers → Neon (Postgres) + MongoDB (Analytics) + Shopify (Commerce)
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          {[
            { id: 'cases', label: 'Active Cases', icon: '🔍' },
            { id: 'evidence', label: 'Evidence Store', icon: '📦' },
            { id: 'internals', label: 'System Internals', icon: '⚙️' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id)}
              className={`px-5 py-2.5 rounded-xl font-semibold transition-all duration-200 flex items-center gap-2 ${activeView === tab.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {activeView === 'cases' && <CasesView />}
        {activeView === 'evidence' && <EvidenceView />}
        {activeView === 'internals' && <InternalsView />}
      </div>
    </div>
  );
}

export default App;
