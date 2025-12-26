import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

const API_BASE_URL = 'http://localhost:3000'

function App() {
  // State
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [backendStatus, setBackendStatus] = useState({ connected: false, message: 'Checking...' })
  const [registerStatus, setRegisterStatus] = useState({ type: '', message: '' })
  const [userName, setUserName] = useState('')
  const [result, setResult] = useState({ name: 'No face detected', confidence: 0 })

  // Refs
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const recognitionIntervalRef = useRef(null)

  // Check backend status
  const checkBackendStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/`)
      const data = await response.json()
      setBackendStatus({ connected: true, message: data.message })
      return true
    } catch (error) {
      setBackendStatus({ connected: false, message: 'Backend Offline' })
      return false
    }
  }, [])

  // Initial backend check
  useEffect(() => {
    checkBackendStatus()
  }, [checkBackendStatus])

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: false
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        streamRef.current = stream
        setIsCameraOn(true)

        // Set canvas size
        if (canvasRef.current) {
          canvasRef.current.width = 640
          canvasRef.current.height = 480
        }
      }
    } catch (error) {
      console.error('Camera error:', error)
      setRegisterStatus({ type: 'error', message: `Camera error: ${error.message}` })
    }
  }

  // Stop camera
  const stopCamera = () => {
    if (isRecognizing) {
      stopRecognition()
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsCameraOn(false)
  }

  // Toggle camera
  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera()
    } else {
      startCamera()
    }
  }

  // Capture frame
  const captureFrame = () => {
    return new Promise((resolve) => {
      if (!videoRef.current || !canvasRef.current) {
        resolve(null)
        return
      }

      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      // Draw mirrored frame
      ctx.save()
      ctx.scale(-1, 1)
      ctx.drawImage(videoRef.current, -canvas.width, 0, canvas.width, canvas.height)
      ctx.restore()

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9)
    })
  }

  // Register user
  const registerUser = async () => {
    if (!userName.trim()) {
      setRegisterStatus({ type: 'error', message: '⚠️ Please enter a name first!' })
      return
    }

    if (!isCameraOn) {
      setRegisterStatus({ type: 'error', message: '⚠️ Please start the camera first!' })
      return
    }

    const backendOk = await checkBackendStatus()
    if (!backendOk) {
      setRegisterStatus({ type: 'error', message: '❌ Backend not running!' })
      return
    }

    setRegisterStatus({ type: 'info', message: '📸 Capturing face...' })

    try {
      const frameBlob = await captureFrame()
      if (!frameBlob) throw new Error('Failed to capture frame')

      setRegisterStatus({ type: 'info', message: '📤 Sending to server...' })

      const formData = new FormData()
      formData.append('name', userName)
      formData.append('file', frameBlob, `${userName}.jpg`)

      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.status === 'success') {
        setRegisterStatus({ type: 'success', message: `✅ ${result.message}` })
        setUserName('')
        setTimeout(() => setRegisterStatus({ type: '', message: '' }), 5000)
      } else {
        setRegisterStatus({ type: 'error', message: `❌ ${result.message}` })
      }
    } catch (error) {
      setRegisterStatus({ type: 'error', message: `❌ Error: ${error.message}` })
    }
  }

  // Recognize face
  const recognizeFace = useCallback(async () => {
    if (!isCameraOn) return

    try {
      const frameBlob = await captureFrame()
      if (!frameBlob) return

      const formData = new FormData()
      formData.append('file', frameBlob, 'frame.jpg')

      const response = await fetch(`${API_BASE_URL}/recognize`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.status === 'success') {
        setResult({ name: data.detected_name, confidence: data.confidence_score })
      } else {
        setResult({ name: 'Error', confidence: 0 })
      }
    } catch (error) {
      setResult({ name: 'Connection Error', confidence: 0 })
    }
  }, [isCameraOn])

  // Start recognition
  const startRecognition = async () => {
    if (!isCameraOn) {
      setRegisterStatus({ type: 'error', message: '⚠️ Please start the camera first!' })
      return
    }

    const backendOk = await checkBackendStatus()
    if (!backendOk) {
      setRegisterStatus({ type: 'error', message: '❌ Backend not running!' })
      return
    }

    setIsRecognizing(true)
    recognizeFace()
    recognitionIntervalRef.current = setInterval(recognizeFace, 1500)
  }

  // Stop recognition
  const stopRecognition = () => {
    setIsRecognizing(false)
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current)
      recognitionIntervalRef.current = null
    }
  }

  // Toggle recognition
  const toggleRecognition = () => {
    if (isRecognizing) {
      stopRecognition()
    } else {
      startRecognition()
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionIntervalRef.current) {
        clearInterval(recognitionIntervalRef.current)
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  const isUnknown = result.name === 'Unknown' || result.name === 'Error' || result.name === 'Connection Error' || result.confidence < 50

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">👤</span>
          <h1>Medoc Face ID</h1>
        </div>
        <p className="tagline">Smart Face Recognition System</p>
        <div className={`backend-status ${backendStatus.connected ? 'success' : 'error'}`}>
          {backendStatus.connected ? '🟢 Backend Connected' : '🔴 Backend Offline'}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Video Section */}
        <section className="video-section">
          <div className="video-container">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {!isCameraOn && (
              <div className="video-overlay">
                <span className="overlay-text">📷 Click "Start Camera" to begin</span>
              </div>
            )}
            <div className={`face-indicator ${isRecognizing ? 'active' : ''}`} />
          </div>
          <button
            className={`btn btn-camera ${isCameraOn ? 'active' : ''}`}
            onClick={toggleCamera}
          >
            <span className="btn-icon">{isCameraOn ? '⏹️' : '📷'}</span>
            {isCameraOn ? 'Stop Camera' : 'Start Camera'}
          </button>
        </section>

        {/* Controls Section */}
        <section className="controls-section">
          {/* Register Panel */}
          <div className="panel register-panel">
            <div className="panel-header">
              <span className="panel-icon">✏️</span>
              <h2>Register New User</h2>
            </div>
            <div className="panel-content">
              <div className="input-group">
                <label htmlFor="userName">Enter Name</label>
                <input
                  type="text"
                  id="userName"
                  placeholder="e.g., John Doe"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && registerUser()}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={registerUser}
                disabled={!isCameraOn}
              >
                <span className="btn-icon">💾</span>
                Register Face
              </button>
            </div>
            {registerStatus.message && (
              <div className={`status-message ${registerStatus.type}`}>
                {registerStatus.message}
              </div>
            )}
          </div>

          {/* Recognize Panel */}
          <div className="panel recognize-panel">
            <div className="panel-header">
              <span className="panel-icon">🔍</span>
              <h2>Live Recognition</h2>
            </div>
            <div className="panel-content">
              <button
                className={`btn btn-secondary ${isRecognizing ? 'active' : ''}`}
                onClick={toggleRecognition}
                disabled={!isCameraOn}
              >
                <span className="btn-icon">{isRecognizing ? '⏸️' : '▶️'}</span>
                {isRecognizing ? 'Stop Recognition' : 'Start Recognition'}
              </button>
              <div className="recognition-status">
                <span className="status-label">Status:</span>
                <span className={`status-value ${isRecognizing ? 'running' : ''}`}>
                  {isRecognizing ? 'Running...' : 'Idle'}
                </span>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="panel results-panel">
            <div className="panel-header">
              <span className="panel-icon">📋</span>
              <h2>Recognition Result</h2>
            </div>
            <div className="result-content">
              <div
                className="result-avatar"
                style={{
                  background: isUnknown
                    ? 'linear-gradient(135deg, #6b7280 0%, #4b5563 100%)'
                    : 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                }}
              >
                {isUnknown ? '?' : result.name.charAt(0).toUpperCase()}
              </div>
              <div className="result-details">
                <div className={`result-name ${isUnknown ? 'unknown' : 'recognized'}`}>
                  {result.name}
                </div>
                <div className="confidence-bar">
                  <div
                    className="confidence-fill"
                    style={{
                      width: `${result.confidence}%`,
                      background: result.confidence >= 70
                        ? 'linear-gradient(90deg, #10b981 0%, #059669 100%)'
                        : result.confidence >= 50
                          ? 'linear-gradient(90deg, #f59e0b 0%, #d97706 100%)'
                          : 'linear-gradient(90deg, #ef4444 0%, #b91c1c 100%)'
                    }}
                  />
                </div>
                <div className="confidence-text">
                  Confidence: <span>{result.confidence}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Powered by DeepFace & ArcFace | Medoc © 2024</p>
      </footer>
    </div>
  )
}

export default App
