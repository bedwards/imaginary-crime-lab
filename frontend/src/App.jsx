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

  // Initialize and fetch data
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

      // Update live connection count
      if (activity.type === 'connection_count') {
        setLiveConnections(activity.count);
      }

      // If case solved, refresh cases
      if (activity.type === 'case_solved') {
        fetchInitialData();
      }
    };

    eventSource.onerror = () => {
      console.log('Activity stream disconnected, reconnecting...');
    };

    return () => eventSource.close();
  };

  const addToCart = async (evidenceId) => {
    const item = evidence.find(e => e.id === evidenceId);
    if (!item) return;

    setCart(prev => [...prev, item]);

    // Track activity in MongoDB
    await fetch(`${API_BASE}/activity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'cart_add',
        evidence_id: evidenceId,
        timestamp: new Date().toISOString()
      })
    });
  };

  const purchaseCart = async () => {
    // Check which cases can be solved
    const evidenceIds = cart.map(e => e.id);
    const solvableCases = cases.filter(c =>
      c.required_evidence.every(reqId => evidenceIds.includes(reqId))
    );

    if (solvableCases.length === 0) {
      alert('This evidence doesn\'t complete any cases yet');
      return;
    }

    // Create Shopify checkout through Worker
    const response = await fetch(`${API_BASE}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evidence_ids: evidenceIds,
        case_ids: solvableCases.map(c => c.id)
      })
    });

    const { checkout_url } = await response.json();
    window.location.href = checkout_url;
  };

  const CaseCard = ({ caseData }) => {
    const requiredEvidence = evidence.filter(e =>
      caseData.required_evidence.includes(e.id)
    );
    const owned = cart.map(c => c.id);
    const progress = requiredEvidence.filter(e => owned.includes(e.id)).length;
    const total = requiredEvidence.length;
    const solved = progress === total;

    return (
      <div className={`border-2 rounded-lg p-6 ${solved ? 'border-green-500 bg-green-50' : 'border-gray-300'}`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              {solved ? <CheckCircle className="text-green-600" /> : <Lock className="text-gray-400" />}
              Case #{caseData.number}
            </h3>
            <p className="text-gray-600 mt-1">{caseData.title}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Progress</div>
            <div className="text-2xl font-bold">{progress}/{total}</div>
          </div>
        </div>

        <p className="text-gray-700 mb-4">{caseData.description}</p>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-gray-700">Required Evidence:</div>
          {requiredEvidence.map(ev => (
            <div key={ev.id} className={`flex items-center justify-between p-2 rounded ${owned.includes(ev.id) ? 'bg-green-100' : 'bg-gray-100'
              }`}>
              <span>{ev.name}</span>
              <span className="font-mono text-sm">${ev.price}</span>
            </div>
          ))}
        </div>

        {solved && (
          <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded">
            <div className="font-bold text-green-800 mb-2">🎉 CASE SOLVED</div>
            <p className="text-sm text-green-700">{caseData.solution}</p>
          </div>
        )}
      </div>
    );
  };

  const InternalView = () => (
    <div className="space-y-6">
      <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Database className="text-blue-600" />
          Database Metrics (Neon Postgres)
        </h3>
        <div className="grid grid-cols-3 gap-4 font-mono text-sm">
          <div>
            <div className="text-gray-600">Total Cases</div>
            <div className="text-2xl font-bold">{dbMetrics.total_cases || 0}</div>
          </div>
          <div>
            <div className="text-gray-600">Solved Cases</div>
            <div className="text-2xl font-bold text-green-600">{dbMetrics.solved_cases || 0}</div>
          </div>
          <div>
            <div className="text-gray-600">Evidence Items</div>
            <div className="text-2xl font-bold">{dbMetrics.evidence_count || 0}</div>
          </div>
        </div>
      </div>

      <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Zap className="text-purple-600" />
          Live Activity (MongoDB Atlas)
        </h3>
        <div className="mb-4">
          <div className="text-sm text-gray-600">Active Connections</div>
          <div className="text-3xl font-bold text-purple-600">{liveConnections}</div>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {activities.map((activity, i) => (
            <div key={i} className="bg-white p-2 rounded border text-sm font-mono">
              <span className="text-gray-500">{new Date(activity.timestamp).toLocaleTimeString()}</span>
              {' '}
              <span className="font-semibold">{activity.type}</span>
              {' '}
              <span className="text-gray-600">{JSON.stringify(activity.data)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
          <FileText className="text-yellow-600" />
          Shopify Integration
        </h3>
        <div className="space-y-2 text-sm font-mono">
          <div className="flex justify-between">
            <span>Storefront API:</span>
            <span className="text-green-600">Connected</span>
          </div>
          <div className="flex justify-between">
            <span>Products Synced:</span>
            <span>{evidence.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Cache Strategy:</span>
            <span>Edge w/ 5min TTL</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-2xl font-bold text-gray-400">Loading Crime Lab...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gray-900 text-white p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-bold mb-2">🔬 Imaginary Crime Lab</h1>
          <p className="text-gray-300">Cases solve themselves when you collect all the evidence</p>
          <div className="mt-4 text-xs text-gray-400 font-mono">
            Architecture: React (GitHub Pages) → Workers (Edge) → Neon (Postgres) + MongoDB (Live) + Shopify (Commerce)
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex gap-4">
          <button
            onClick={() => setActiveView('cases')}
            className={`px-4 py-2 rounded font-semibold ${activeView === 'cases' ? 'bg-blue-600 text-white' : 'bg-gray-100'
              }`}
          >
            Active Cases
          </button>
          <button
            onClick={() => setActiveView('evidence')}
            className={`px-4 py-2 rounded font-semibold ${activeView === 'evidence' ? 'bg-blue-600 text-white' : 'bg-gray-100'
              }`}
          >
            Evidence Store
          </button>
          <button
            onClick={() => setActiveView('internals')}
            className={`px-4 py-2 rounded font-semibold ${activeView === 'internals' ? 'bg-blue-600 text-white' : 'bg-gray-100'
              }`}
          >
            System Internals
          </button>
          <div className="flex-1" />
          <button className="px-4 py-2 rounded bg-green-600 text-white font-semibold flex items-center gap-2">
            <ShoppingCart size={20} />
            Cart ({cart.length})
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {activeView === 'cases' && (
          <div className="grid gap-6">
            {cases.map(caseData => (
              <CaseCard key={caseData.id} caseData={caseData} />
            ))}
          </div>
        )}

        {activeView === 'evidence' && (
          <div className="grid grid-cols-3 gap-6">
            {evidence.map(item => (
              <div key={item.id} className="border rounded-lg p-6 bg-white">
                <h3 className="font-bold text-lg mb-2">{item.name}</h3>
                <p className="text-gray-600 text-sm mb-4">{item.description}</p>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">${item.price}</span>
                  <button
                    onClick={() => addToCart(item.id)}
                    className="px-4 py-2 bg-blue-600 text-white rounded font-semibold hover:bg-blue-700"
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
      {cart.length > 0 && (
        <div className="fixed bottom-8 right-8 bg-white border-2 border-gray-300 rounded-lg shadow-2xl p-6 w-96">
          <h3 className="font-bold text-lg mb-4">Cart Summary</h3>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {cart.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.name}</span>
                <span>${item.price}</span>
              </div>
            ))}
          </div>
          <div className="border-t pt-4">
            <div className="flex justify-between font-bold mb-4">
              <span>Total</span>
              <span>${cart.reduce((sum, item) => sum + parseFloat(item.price), 0).toFixed(2)}</span>
            </div>
            <button
              onClick={purchaseCart}
              className="w-full bg-green-600 text-white py-3 rounded font-bold hover:bg-green-700"
            >
              Purchase & Solve Cases
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
