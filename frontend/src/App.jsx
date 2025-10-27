import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Lock, Unlock, Database, Zap, ShoppingCart, FileText } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8787';

export default function CrimeLab() {
  const [cases, setCases] = useState([]);
  const [activities, setActivities] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('cases');
  const [dbMetrics, setDbMetrics] = useState({});
  const [liveConnections, setLiveConnections] = useState(0);
  const [showCart, setShowCart] = useState(false);
  const [purchasedEvidence, setPurchasedEvidence] = useState([]);
  const [detectiveComment, setDetectiveComment] = useState('React (GitHub Pages) → Workers (Edge) → Neon (Postgres) + MongoDB (Live) + Shopify (Commerce)');

  // Remove purchased items from evidence pane
  const availableEvidence = evidence.filter(e => !purchasedEvidence.includes(e.id));

  // Fetch purchased evidence on load
  useEffect(() => {
    fetch(`${API_BASE}/purchased-evidence`)
      .then(r => r.json())
      .then(setPurchasedEvidence)
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetchInitialData();
    subscribeToLiveActivity();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [casesRes, evidenceRes, metricsRes] = await Promise.all([
        fetch(`${API_BASE}/cases`),
        fetch(`${API_BASE}/evidence`),
        fetch(`${API_BASE}/metrics`)
      ]);
      setCases(await casesRes.json());
      setEvidence(await evidenceRes.json());
      setDbMetrics(await metricsRes.json());
      setLoading(false);
    } catch (error) {
      console.error('Init failed:', error);
      setLoading(false);
    }
  };

  const subscribeToLiveActivity = () => {
    const eventSource = new EventSource(`${API_BASE}/activity/stream`);
    eventSource.onmessage = (event) => {
      const activity = JSON.parse(event.data);
      setActivities(prev => [activity, ...prev].slice(0, 50));
      if (activity.type === 'connection_count') setLiveConnections(activity.count);
      if (activity.type === 'case_solved') fetchInitialData();
    };
    eventSource.onerror = () => console.log('Activity stream disconnected, reconnecting...');
    return () => eventSource.close();
  };

  const addToCart = async (evidenceId) => {
    const item = evidence.find(e => e.id === evidenceId);
    if (!item) return;
    setCart(prev => [...prev, item]);

    // Fetch detective comment
    fetch(`${API_BASE}/detective-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence_id: evidenceId, evidence_name: item.name })
    })
      .then(r => r.json())
      .then(data => {
        setDetectiveComment(data.comment);
        setTimeout(() => {
          setDetectiveComment('React (GitHub Pages) → Workers (Edge) → Neon (Postgres) + MongoDB (Live) + Shopify (Commerce)');
        }, 16000);
      })
      .catch(err => console.error('Detective comment failed:', err));

    await fetch(`${API_BASE}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'cart_add', evidence_id: evidenceId, timestamp: new Date().toISOString() })
    });
  };

  const removeFromCart = (index) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const purchaseCart = async () => {
    const variant_ids = cart.map(item => item.variant_id);

    const response = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant_ids })
    });

    const data = await response.json();

    if (!data.checkout_url) {
      alert(`Checkout failed: ${data.error || 'Unknown error'}`);
      return;
    }

    setCart([]);
    window.location.href = data.checkout_url;
  };

  const CaseCard = ({ caseData }) => {
    const requiredEvidence = evidence.filter(e => caseData.required_evidence?.includes(e.id));
    const collectedEvidence = requiredEvidence.filter(e => purchasedEvidence.includes(e.id));
    const progress = requiredEvidence.length ? (collectedEvidence.length / requiredEvidence.length) * 100 : 0;
    const solved = caseData.solved_at || progress === 100;

    return (
      <div className={`relative overflow-hidden rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02] ${solved ? 'bg-gradient-to-br from-green-50 to-emerald-100 border-2 border-green-400 shadow-green-200' :
        'bg-white border-2 border-slate-200'
        } shadow-xl`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {solved ? <CheckCircle className="text-green-600" size={24} /> : <Lock className="text-amber-600" size={24} />}
              <span className="text-sm font-mono text-slate-500">{caseData.number}</span>
            </div>
            <h3 className="text-2xl font-bold text-slate-800">{caseData.title}</h3>
          </div>
          {solved && <div className="text-4xl animate-bounce">🎉</div>}
        </div>

        <p className="text-slate-600 mb-6 leading-relaxed">{caseData.description}</p>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-700">Progress</span>
            <span className="font-mono text-slate-600">{Math.round(progress)}%</span>
          </div>
          <div className="h-3 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-500 ${solved ? 'bg-gradient-to-r from-green-500 to-emerald-600' : 'bg-gradient-to-r from-blue-500 to-cyan-600'
              }`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-700 mb-3">Required Evidence:</div>
          <div className="grid grid-cols-2 gap-2">
            {requiredEvidence.map(ev => (
              <div key={ev.id} className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${collectedEvidence.some(c => c.id === ev.id) ?
                'bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-md' :
                'bg-slate-100 text-slate-600'
                }`}>
                {ev.name}
              </div>
            ))}
          </div>
        </div>

        {solved && (
          <div className="mt-6 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl text-white">
            <div className="font-bold mb-2 flex items-center gap-2">
              <CheckCircle size={20} /> CASE SOLVED
            </div>
            <p className="text-sm opacity-90">{caseData.solution}</p>
          </div>
        )}
      </div>
    );
  };

  const InternalView = () => {
    const resetProgress = async () => {
      if (!confirm('Reset all progress? This will clear purchases and unsolved cases.')) return;

      await fetch(`${API_BASE}/reset-progress`, { method: 'POST' });
      window.location.reload();
    };

    return (
      <div>
        <div className="space-y-6">
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

          <div className="bg-gradient-to-br from-purple-50 to-pink-100 border-2 border-purple-300 rounded-2xl p-6 shadow-xl">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-purple-900">
              <Zap size={24} />
              Live Activity (MongoDB Atlas)
            </h3>
            <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 mb-4">
              <div className="text-sm text-purple-700 mb-1">Active Connections</div>
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
                </div>
              ))}
            </div>
          </div>

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
        <button
          onClick={resetProgress}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
        >
          Reset Progress
        </button>
      </div>
    );
  };

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
      {/* Header with Gradient */}
      <div className="sticky overflow-hidden bg-gradient-to-r from-slate-900 via-blue-900 to-cyan-900 text-white top-0 z-50">
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

          {/* <div className="mt-6 text-xs text-cyan-300/70 font-mono bg-black/20 backdrop-blur-sm rounded-lg px-4 py-2 inline-block transition-all duration-300 animate-pulse">
            {detectiveComment}
          </div> */}

          {/* <div className="className= mt-6 text-xs text-cyan-300/70 font-mono bg-black/20 backdrop-blur-sm rounded-lg px-4 py-2 inline-block transition-all duration-300 shadow-[0_0_15px_rgba(34,211,238,0.5)]">
            {detectiveComment}
          </div> */}

          <div className="mt-6 text-xs text-cyan-300/70 font-mono bg-black/20 backdrop-blur-sm rounded-lg px-4 py-2 inline-block transition-all duration-300 animate-pulse shadow-[0_0_30px_rgba(6,182,212,0.9)] ring-2 ring-cyan-400/50">
            {detectiveComment}
          </div>

          {/* <div className="mt-6 text-xs text-cyan-300 font-mono bg-black/30 backdrop-blur-sm rounded-lg px-4 py-2 inline-block transition-all duration-500 hover:scale-105 shadow-[0_0_25px_rgba(34,211,238,0.8),0_0_50px_rgba(34,211,238,0.4)] border border-cyan-400/60 animate-bounce">
            {detectiveComment}
          </div> */}

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
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg scale-105'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowCart(!showCart)}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-200 flex items-center gap-2 hover:scale-105"
          >
            <ShoppingCart size={20} />
            Cart ({cart.length})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        {activeView === 'cases' && (
          <div className="grid gap-6">
            {cases.map(caseData => (
              <CaseCard key={caseData.id} caseData={caseData} />
            ))}
          </div>
        )}

        {activeView === 'evidence' && (
          <div className="grid grid-cols-3 gap-6">
            {availableEvidence.map(item => (
              <div key={item.id} className="group bg-white rounded-2xl p-6 border-2 border-slate-200 shadow-lg hover:shadow-2xl hover:scale-105 transition-all duration-300 hover:border-blue-400">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="font-bold text-xl mb-2 text-slate-800">{item.name}</h3>
                <p className="text-slate-600 text-sm mb-6 leading-relaxed">{item.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                    ${item.price}
                  </span>
                  <button
                    onClick={() => addToCart(item.id)}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all duration-200 hover:scale-110"
                  >
                    Add to Cart
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeView === 'internals' && <InternalView />}
      </div>

      {/* Cart Sidebar */}
      {
        showCart && (
          <div className="fixed bottom-8 right-8 bg-white/95 backdrop-blur-lg border-2 border-blue-300 rounded-2xl shadow-2xl p-6 w-96 animate-in slide-in-from-bottom">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-xl text-slate-800">Cart Summary</h3>
              <button
                onClick={() => setShowCart(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                ✕
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart size={48} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">Your cart is empty</p>
                <p className="text-sm text-slate-400 mt-2">Add evidence from the Evidence Store</p>
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-6 max-h-48 overflow-y-auto">
                  {cart.map((item, i) => (
                    <div key={i} className="flex justify-between items-center text-sm bg-slate-50 p-2 rounded-lg">
                      <span className="text-slate-700 flex-1">{item.name}</span>
                      <span className="font-bold text-blue-600 mr-2">${item.price}</span>
                      <button
                        onClick={() => removeFromCart(i)}
                        className="text-red-500 hover:text-red-700 text-xs px-2 py-1"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between font-bold mb-4 text-lg">
                    <span className="text-slate-800">Total</span>
                    <span className="bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
                      ${cart.reduce((sum, item) => sum + parseFloat(item.price), 0).toFixed(2)}
                    </span>
                  </div>
                  <button
                    onClick={purchaseCart}
                    className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-xl font-bold shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
                  >
                    Purchase & Solve Cases
                  </button>
                </div>
              </>
            )}
          </div>
        )
      }
    </div >
  );
}
