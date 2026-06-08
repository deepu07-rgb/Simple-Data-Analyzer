'use client'

import { useEffect, useState } from 'react'

export default function Home() {
  const [html, setHtml] = useState<string>('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Fetch the standalone HTML from our API route
    fetch('/api')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load')
        return r.text()
      })
      .then(text => {
        setHtml(text)
        setLoaded(true)
      })
      .catch(() => {
        setLoaded(true)
      })
  }, [])

  if (!loaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        color: '#64748b'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 32, height: 32,
            border: '3px solid #e2e8f0',
            borderTopColor: '#3b82f6',
            borderRadius: '50%',
            animation: 'spin 0.6s linear infinite',
            margin: '0 auto 12px'
          }} />
          <p>Loading Simple Data Analyser...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    )
  }

  if (!html) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        color: '#ef4444'
      }}>
        <p>Failed to load application. Please refresh the page.</p>
      </div>
    )
  }

  return (
    <iframe
      srcDoc={html}
      style={{
        width: '100vw',
        height: '100vh',
        border: 'none',
        position: 'fixed',
        top: 0,
        left: 0,
      }}
      title="Simple Data Analyser"
    />
  )
}