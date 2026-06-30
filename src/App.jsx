import { useState, useRef } from 'react'
import CsvUploader from './components/CsvUploader.jsx'
import DataTable from './components/DataTable.jsx'
import ErrorBanner from './components/ErrorBanner.jsx'
import { parseRulesCSV, parseCartCSV } from './engine/csvParser.js'

// ── Column definitions ───────────────────────────────────────────

const RULES_COLUMNS = [
  { key: 'ruleId',    label: 'Rule ID' },
  { key: 'scope',     label: 'Scope',      render: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '' },
  { key: 'appliesTo', label: 'Target Brand/Platform', render: (v) => v || '—' },
  { key: 'type',      label: 'Type',       render: (v) => v ? v.charAt(0).toUpperCase() + v.slice(1) : '' },
  {
    key: 'value',
    label: 'Value',
    render: (v, row) => row.type === 'percentage' ? `${v}% off` : `Rs.${v} off`,
  },
  { key: 'stackable', label: 'Stackable',  render: (v) => (v ? 'Yes' : 'No') },
  { key: 'min_cart_value', label: 'Min Cart', render: (v) => v ? `Rs.${v}` : '—' }
]

const CART_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'brand',     label: 'Brand' },
  { key: 'platform',  label: 'Platform' },
  { key: 'basePrice', label: 'Base Price', render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
]

const RESULTS_COLUMNS = [
  { key: 'itemId',    label: 'Item' },
  { key: 'product',   label: 'Product' },
  { key: 'basePrice', label: 'Base Price',  render: (v) => `Rs.${v.toLocaleString('en-IN')}` },
  { key: 'finalPrice',label: 'Final Price',
    render: (v, row) => (
      <span style={{ fontWeight: 700, color: row.totalDiscount > 0 ? '#1e5c2c' : '#131A48' }}>
        Rs.{v.toLocaleString('en-IN')}
      </span>
    ),
  },
  {
    key: 'totalDiscount',
    label: 'You Save',
    render: (v) =>
      v > 0 ? (
        <span style={{ color: '#1e5c2c', fontWeight: 600 }}>Rs.{v.toLocaleString('en-IN')}</span>
      ) : (
        <span style={{ color: '#888' }}>—</span>
      ),
  },
  {
    key: 'reasoning',
    label: 'Offer Applied',
    render: (v) => (
      <span style={{ color: v === 'No offers available' ? '#888' : '#131A48', fontStyle: v === 'No offers available' ? 'italic' : 'normal' }}>
        {v}
      </span>
    ),
  },
]

// ── Styles ───────────────────────────────────────────────────────

const S = {
  page:    { minHeight: '100vh', background: '#f7f7f9', fontFamily: 'Arial, sans-serif' },
  header:  { background: '#131A48', padding: '0.85rem 2rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  logoTxt: { fontFamily: 'Georgia, serif', fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' },
  logoSpan:{ color: '#FF5800' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.07em' },
  main:    { maxWidth: 960, margin: '0 auto', padding: '1.8rem 1.5rem' },
  section: { background: '#fff', border: '1px solid #CECECE', borderRadius: 6, padding: '1.2rem 1.4rem', marginBottom: '1.2rem' },
  sectionTitle: { fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 14, color: '#131A48', marginBottom: '0.7rem', paddingBottom: 6, borderBottom: '2px solid #FF5800', display: 'inline-block' },
  grid2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' },
  btn:     {
    background: '#FF5800', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  btnDisabled: {
    background: '#CECECE', color: '#fff', border: 'none', borderRadius: 4,
    padding: '0.65rem 2rem', fontSize: 13, fontWeight: 700, cursor: 'not-allowed',
    letterSpacing: '0.04em', textTransform: 'uppercase',
  },
  totalRow: {
    display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
    gap: '1rem', marginTop: '0.75rem', paddingTop: '0.75rem',
    borderTop: '2px solid #131A48',
  },
  totalLabel: { fontWeight: 700, fontSize: 14, color: '#131A48' },
  totalValue: { fontWeight: 700, fontSize: 16, color: '#131A48' },
  tag: (color, bg) => ({
    display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 6px',
    borderRadius: 20, background: bg, color, textTransform: 'uppercase', letterSpacing: '0.04em',
  }),
  input: { padding: '8px', width: '100%', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: 4, marginBottom: '8px' },
  uploadBtn: { background: '#131A48', color: '#fff', padding: '6px 12px', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12, marginTop: 8 }
}

// ── Component ────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function App() {
  const [rules, setRules]           = useState([])
  const [rulesErrors, setRulesErr]  = useState([])
  const [rulesFileName, setRulesFileName] = useState('')

  const [cartItems, setCartItems]   = useState([])
  const [cartErrors, setCartErrors] = useState([])
  const [cartFileName, setCartFileName]   = useState('')

  const [results, setResults]       = useState(null)
  
  // NL Parsing state
  const [nlText, setNlText] = useState('')
  const [nlModel, setNlModel] = useState('gemini')
  const [showThinking, setShowThinking] = useState(false)
  const [thinkingText, setThinkingText] = useState('')
  const [nlLoading, setNlLoading] = useState(false)
  const [nlError, setNlError] = useState('')
  const [parsedRule, setParsedRule] = useState(null)
  const [ruleAdded, setRuleAdded] = useState(false)

  const pdfInputRef = useRef(null)
  const [pdfModel, setPdfModel] = useState('gemini')
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── Handlers ──

  function handleRulesLoad(csvText, fileName) {
    const { data, errors } = parseRulesCSV(csvText)
    setRules(data)
    setRulesErr(errors)
    setRulesFileName(fileName)
    setResults(null)
  }

  function handleCartLoad(csvText, fileName) {
    const { data, errors } = parseCartCSV(csvText)
    setCartItems(data)
    setCartErrors(errors)
    setCartFileName(fileName)
    setResults(null)
  }

  async function handlePdfUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    
    setPdfLoading(true)
    setCartErrors([])
    
    const formData = new FormData()
    formData.append("file", file)
    formData.append("model", pdfModel)
    
    try {
      const res = await fetch(`${API_BASE}/api/cart/upload-pdf`, {
        method: 'POST',
        body: formData
      })
      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(errorText)
      }
      const data = await res.json()
      setCartItems(data)
      setCartFileName(file.name)
      setResults(null)
    } catch (err) {
      setCartErrors([{ message: `PDF Upload failed: ${err.message}` }])
    } finally {
      setPdfLoading(false)
      e.target.value = ''
    }
  }

  async function handleCalculate() {
    try {
      const res = await fetch(`${API_BASE}/api/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cartItems, rules: rules })
      })
      if (!res.ok) throw new Error("Calculation failed")
      const data = await res.json()
      setResults(data)
    } catch (err) {
      alert(err.message)
    }
  }

  async function handleParseNl() {
    if (!nlText.trim()) return
    setNlLoading(true)
    setNlError('')
    setParsedRule(null)
    setRuleAdded(false)
    setThinkingText('')
    
    try {
      const res = await fetch(`${API_BASE}/api/rules/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: nlText, model: nlModel, show_thinking: showThinking })
      })
      
      if (!res.ok) throw new Error("Failed to parse rule.")

      if (nlModel === 'stepfun' && showThinking) {
        const reader = res.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let done = false
        let buffer = ''
        
        while (!done) {
          const { value, done: readerDone } = await reader.read()
          done = readerDone
          if (value) {
            buffer += decoder.decode(value, { stream: true })
            let lines = buffer.split('\n')
            buffer = lines.pop()
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6)
                if (dataStr.trim() === '[DONE]') continue;
                try {
                  const event = JSON.parse(dataStr)
                  if (event.type === 'reasoning') {
                    setThinkingText(prev => prev + event.text)
                  } else if (event.type === 'result') {
                    setParsedRule(event.data)
                  } else if (event.type === 'error') {
                    setNlError(event.message)
                  }
                } catch (e) {
                  // Incomplete JSON or other error, ignore
                }
              }
            }
          }
        }
      } else {
        const data = await res.json()
        if (data.success) {
          setParsedRule(data.rule)
        } else {
          setNlError(data.message)
        }
      }
    } catch (err) {
      setNlError("Failed to parse rule via API.")
    } finally {
      setNlLoading(false)
    }
  }

  function confirmParsedRule() {
    if (parsedRule) {
      setRules([...rules, parsedRule])
      setRuleAdded(true)
      setNlText('')
      setResults(null)
    }
  }

  const canCalculate = rules.length > 0 && cartItems.length > 0

  // ── Render ──

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logoTxt}>O<span style={S.logoSpan}>pp</span>tra</div>
        <div style={S.headerSub}>Discount Engine</div>
      </div>

      <div style={S.main}>

        {/* NLP Rule Input */}
        <div style={S.section}>
          <div style={S.sectionTitle}>Add Rule (AI)</div>
          
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 12, fontSize: 13, alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="nlModel" 
                  value="gemini" 
                  checked={nlModel === 'gemini'} 
                  onChange={e => {
                    setNlModel(e.target.value)
                    setShowThinking(false)
                  }} 
                  disabled={nlLoading} 
                />
                Gemini-2.5-Flash
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input 
                  type="radio" 
                  name="nlModel" 
                  value="stepfun" 
                  checked={nlModel === 'stepfun'} 
                  onChange={e => setNlModel(e.target.value)} 
                  disabled={nlLoading} 
                />
                Step-3.7-Flash (NVIDIA)
              </label>
            </div>
            
            {nlModel === 'stepfun' && (
              <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                <input 
                  type="checkbox" 
                  checked={showThinking} 
                  onChange={e => setShowThinking(e.target.checked)} 
                  disabled={nlLoading}
                />
                Show Thinking
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
             <input 
               style={S.input}
               placeholder="e.g. 10% off if cart value is more than Rs.5,000"
               value={nlText}
               onChange={e => setNlText(e.target.value)}
               disabled={nlLoading}
             />
             <button style={S.btn} onClick={handleParseNl} disabled={nlLoading || !nlText.trim()}>
                {nlLoading ? "Parsing..." : "Parse"}
             </button>
          </div>
          
          {nlLoading && nlModel === 'stepfun' && (
            <div style={{ background: '#e3f2fd', color: '#0d47a1', padding: '8px 12px', borderRadius: 4, marginTop: 10, fontSize: 13, border: '1px solid #bbdefb' }}>
              I'm using free NVIDIA API key for LLM(Step-3.7-Flash), so be patient, lot of people are using it!
            </div>
          )}
          
          {thinkingText && (
            <div style={{ background: '#222', color: '#0f0', padding: '10px 14px', borderRadius: 6, marginTop: 10, fontSize: 12, fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
              <div style={{ color: '#888', marginBottom: 4 }}>// Step-3.7-Flash Thinking Process...</div>
              {thinkingText}
            </div>
          )}

          {nlError && <div style={{ color: '#d32f2f', background: '#ffebee', padding: '8px 12px', borderRadius: 4, marginTop: 10, fontSize: 13, border: '1px solid #ffcdd2' }}>{nlError}</div>}
          
          {parsedRule && (
             <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6, marginTop: 10, border: '1px solid #ddd' }}>
                <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 13 }}>Parsed Rule Confirmation:</div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', marginBottom: 10 }}>
                   Scope: {parsedRule.scope} <br/>
                   Type: {parsedRule.type} <br/>
                   Value: {parsedRule.value} <br/>
                   Target Brand/Platform: {parsedRule.appliesTo || 'N/A'} <br/>
                   Stackable: {parsedRule.stackable ? 'Yes' : 'No'} <br/>
                   Min Cart Value: {parsedRule.min_cart_value || 'N/A'} <br/>
                   Reasoning: {parsedRule.reasoning || 'N/A'}
                </div>
                {ruleAdded ? (
                   <div style={{ color: '#1e5c2c', fontWeight: 'bold', fontSize: 14, marginTop: 4 }}>
                     ✅ Rule Added!
                   </div>
                ) : (
                   <>
                     <button style={{ ...S.btn, padding: '4px 12px' }} onClick={confirmParsedRule}>Confirm & Add</button>
                     <button style={{ ...S.uploadBtn, marginLeft: 8 }} onClick={() => { setParsedRule(null); setRuleAdded(false); }}>Discard</button>
                   </>
                )}
             </div>
          )}
        </div>

        {/* Upload row */}
        <div style={S.grid2}>
          {/* Rules upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Discount Rules</div>
            <CsvUploader
              label="rules.csv"
              description="Upload your discount rules CSV"
              onLoad={handleRulesLoad}
              hasData={rules.length > 0}
              fileName={rulesFileName}
            />
            <ErrorBanner errors={rulesErrors} />
            {rules.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {rules.length} rule{rules.length > 1 ? 's' : ''} active
                </div>
                <DataTable columns={RULES_COLUMNS} rows={rules} />
              </div>
            )}
          </div>

          {/* Cart upload */}
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Items</div>
            <CsvUploader
              label="cart.csv"
              description="Upload your cart CSV"
              onLoad={handleCartLoad}
              hasData={cartItems.length > 0 && cartFileName.endsWith('.csv')}
              fileName={cartFileName}
            />
            
            <div style={{ marginTop: 12, borderTop: '1px dashed #ccc', paddingTop: 12 }}>
               <div style={{ marginBottom: 10, display: 'flex', gap: 12, fontSize: 12, alignItems: 'center' }}>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                   <input 
                     type="radio" 
                     name="pdfModel" 
                     value="gemini" 
                     checked={pdfModel === 'gemini'} 
                     onChange={e => setPdfModel(e.target.value)} 
                     disabled={pdfLoading} 
                   />
                   Gemini-2.5-Flash
                 </label>
                 <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                   <input 
                     type="radio" 
                     name="pdfModel" 
                     value="stepfun" 
                     checked={pdfModel === 'stepfun'} 
                     onChange={e => setPdfModel(e.target.value)} 
                     disabled={pdfLoading} 
                   />
                   Step-3.7-Flash (NVIDIA)
                 </label>
               </div>
               <input type="file" accept=".pdf" ref={pdfInputRef} style={{ display: 'none' }} onChange={handlePdfUpload} />
               <button style={S.uploadBtn} onClick={() => pdfInputRef.current?.click()} disabled={pdfLoading}>
                  {pdfLoading ? "Extracting from PDF..." : "Upload Cart PDF (AI Vision)"}
               </button>
            </div>

            <ErrorBanner errors={cartErrors} />
            {cartItems.length > 0 && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                  {cartItems.length} item{cartItems.length > 1 ? 's' : ''} loaded {cartFileName && `from ${cartFileName}`}
                </div>
                <DataTable columns={CART_COLUMNS} rows={cartItems} />
              </div>
            )}
          </div>
        </div>

        {/* Calculate button */}
        <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
          <button
            style={canCalculate ? S.btn : S.btnDisabled}
            onClick={handleCalculate}
            disabled={!canCalculate}
          >
            Calculate Discounts
          </button>
          {!canCalculate && (
            <div style={{ fontSize: 11, color: '#888', marginTop: 6 }}>
              Load rules and cart to calculate
            </div>
          )}
        </div>

        {/* Results */}
        {results && (
          <div style={S.section}>
            <div style={S.sectionTitle}>Cart Summary</div>
            <DataTable columns={RESULTS_COLUMNS} rows={results.results} />
            
            {results.cart_offer && (
              <div style={{ background: '#e8f5e9', padding: '10px 14px', borderRadius: 4, marginTop: 12, display: 'flex', justifyContent: 'space-between', border: '1px solid #c8e6c9' }}>
                 <span style={{ color: '#1e5c2c', fontWeight: 600 }}>{results.cart_offer.reasoning}</span>
                 <span style={{ color: '#1e5c2c', fontWeight: 600 }}>- Rs.{results.cart_offer.savings.toLocaleString('en-IN')}</span>
              </div>
            )}
            
            <div style={S.totalRow}>
              <span style={S.totalLabel}>Cart Total</span>
              <span style={S.totalValue}>Rs.{results.final_cart_total.toLocaleString('en-IN')}</span>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
