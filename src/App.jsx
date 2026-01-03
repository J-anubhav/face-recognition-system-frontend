import { useState, useRef, useEffect, useCallback } from 'react'
import './App.css'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'

function App() {
  // State
  const [isCameraOn, setIsCameraOn] = useState(false)
  const [isRecognizing, setIsRecognizing] = useState(false)
  const [backendStatus, setBackendStatus] = useState({ connected: false, message: 'Checking...' })
  const [registerStatus, setRegisterStatus] = useState({ type: '', message: '' })
  const [hospitalId, setHospitalId] = useState('')
  const [employeeId, setEmployeeId] = useState('')
  const [result, setResult] = useState({ hospitalId: 'Unknown', employeeId: 'Unknown', confidence: 0 })

  // Refs
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const recognitionIntervalRef = useRef(null)

  // Check backend status
  const checkBackendStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/health`)
      const data = await response.json()
      if (data.status === 'healthy') {
        setBackendStatus({ connected: true, message: 'Online' })
        return true
      }
      throw new Error('Backend unhealthy')
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

  // Capture CENTER CROP frame
  const captureFrame = () => {
    return new Promise((resolve) => {
      if (!videoRef.current || !canvasRef.current) {
        resolve(null)
        return
      }

      const video = videoRef.current
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d')

      // Define crop dimensions (square crop from center)
      const cropSize = 300 // Size of the face box
      const startX = (video.videoWidth - cropSize) / 2
      const startY = (video.videoHeight - cropSize) / 2

      // Set canvas size to crop size
      canvas.width = cropSize
      canvas.height = cropSize

      // Draw cropped image
      // Source: video, sx, sy, sWidth, sHeight (source crop)
      // Destination: x, y, width, height (canvas)
      ctx.drawImage(video, startX, startY, cropSize, cropSize, 0, 0, cropSize, cropSize)

      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95)
    })
  }

  // Register user
  const registerUser = async () => {
    if (!hospitalId.trim() || !employeeId.trim()) {
      setRegisterStatus({ type: 'error', message: '⚠️ Enter Hospital ID and Employee ID!' })
      return
    }

    if (!isCameraOn) {
      setRegisterStatus({ type: 'error', message: '⚠️ Start camera first!' })
      return
    }

    const backendOk = await checkBackendStatus()
    if (!backendOk) {
      setRegisterStatus({ type: 'error', message: '❌ Backend not running!' })
      return
    }

    setRegisterStatus({ type: 'info', message: '📸 Processing...' })

    try {
      const frameBlob = await captureFrame()
      if (!frameBlob) throw new Error('Failed to capture frame')

      const formData = new FormData()
      formData.append('hospitalId', hospitalId)
      formData.append('employeeId', employeeId)
      formData.append('file', frameBlob, `face_${employeeId}.jpg`)

      const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        setRegisterStatus({ type: 'success', message: `✅ Registered!` })
        setHospitalId('')
        setEmployeeId('')
        setTimeout(() => setRegisterStatus({ type: '', message: '' }), 5000)
      } else {
        setRegisterStatus({ type: 'error', message: `❌ ${result.error || 'Failed'}` })
      }
    } catch (error) {
      setRegisterStatus({ type: 'error', message: '❌ Connection Error' })
    }
  }

  // Recognize face
  const recognizeFace = useCallback(async () => {
    if (!isCameraOn) return

    try {
      const frameBlob = await captureFrame()
      if (!frameBlob) return

      const formData = new FormData()
      formData.append('file', frameBlob, 'query.jpg')

      const response = await fetch(`${API_BASE_URL}/recognize`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.found) {
        setResult({ 
          hospitalId: data.hospitalId, 
          employeeId: data.employeeId, 
          confidence: data.confidence 
        })
      } else {
        setResult({ hospitalId: 'Unknown', employeeId: 'Unknown', confidence: 0 })
      }
    } catch (error) {
      setResult({ hospitalId: 'Error', employeeId: 'Error', confidence: 0 })
    }
  }, [isCameraOn])

  // Start recognition
  const startRecognition = async () => {
    if (!isCameraOn) {
      setRegisterStatus({ type: 'error', message: '⚠️ Start camera first!' })
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

  const isUnknown = result.hospitalId === 'Unknown' || result.hospitalId === 'Error' || result.confidence < 50

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
          {backendStatus.connected ? '🟢 API Online' : '🔴 API Offline'}
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        {/* Video Section */}
        <section className="video-section">
          <div className="video-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ transform: 'scaleX(-1)' }} // Mirror locally only
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Face Guide Box Overlay */}
            {isCameraOn && (
              <div className="face-guide-overlay">
                <div className="face-guide-box">
                  <span>Place Face Here</span>
                </div>
              </div>
            )}

            {!isCameraOn && (
              <div className="video-overlay">
                <span className="overlay-text">📷 Start Camera</span>
              </div>
            )}
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
              <h2>Register</h2>
            </div>
            <div className="panel-content">
              <div className="input-group">
                <label>Hospital ID</label>
                <input
                  type="text"
                  placeholder="e.g. H123"
                  value={hospitalId}
                  onChange={(e) => setHospitalId(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Employee ID</label>
                <input
                  type="text"
                  placeholder="e.g. E456"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
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
              <h2>Detect</h2>
            </div>
            <div className="panel-content">
              <button
                className={`btn btn-secondary ${isRecognizing ? 'active' : ''}`}
                onClick={toggleRecognition}
                disabled={!isCameraOn}
              >
                <span className="btn-icon">{isRecognizing ? '⏸️' : '▶️'}</span>
                {isRecognizing ? 'Stop' : 'Start'}
              </button>
              <div className="recognition-status">
                <span className={`status-value ${isRecognizing ? 'running' : ''}`}>
                  {isRecognizing ? 'Scannning...' : 'Idle'}
                </span>
              </div>
            </div>
          </div>

          {/* Results Panel */}
          <div className="panel results-panel">
            <div className="panel-header">
              <span className="panel-icon">📋</span>
              <h2>Result</h2>
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
                {isUnknown ? '?' : result.employeeId.charAt(0).toUpperCase()}
              </div>
              <div className="result-details">
                <div className={`result-name ${isUnknown ? 'unknown' : 'recognized'}`}>
                  {isUnknown ? 'Unknown' : `${result.hospitalId} / ${result.employeeId}`}
                </div>
                {!isUnknown && (
                  <div className="confidence-text">
                    Confidence: <span>{result.confidence.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="footer">
        <p>Face Auth System</p>
      </footer>
    </div>
  )
}

export default App
