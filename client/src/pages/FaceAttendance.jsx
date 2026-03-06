import { useEffect, useMemo, useRef, useState } from 'react';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import '@tensorflow/tfjs';
import API from '../api/axios';
import { Camera, CircleCheck, CircleX, UserRound, ScanFace, ShieldCheck } from 'lucide-react';

const MIN_ENROLL_SAMPLES = 3;
const MAX_ENROLL_SAMPLES = 5;

let detectorSingleton = null;

async function getFaceDetector() {
    if (detectorSingleton) return detectorSingleton;

    detectorSingleton = await faceLandmarksDetection.createDetector(
        faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh,
        {
            runtime: 'mediapipe',
            solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh',
            maxFaces: 1,
            refineLandmarks: true,
        }
    );

    return detectorSingleton;
}

function buildEmbeddingFromFace(face) {
    const keypoints = face?.keypoints || [];
    if (keypoints.length < 100) {
        throw new Error('Face landmarks are insufficient for matching');
    }

    const xs = keypoints.map((point) => point.x || 0);
    const ys = keypoints.map((point) => point.y || 0);
    const zs = keypoints.map((point) => (typeof point.z === 'number' ? point.z : 0));

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const depth = Math.max(1, maxZ - minZ);

    const embedding = [];
    keypoints.forEach((point) => {
        const pointZ = typeof point.z === 'number' ? point.z : 0;
        embedding.push((point.x - centerX) / width);
        embedding.push((point.y - centerY) / height);
        embedding.push((pointZ - centerZ) / depth);
    });

    return embedding;
}

export default function FaceAttendance() {
    const videoRef = useRef(null);
    const [interns, setInterns] = useState([]);
    const [selectedInternId, setSelectedInternId] = useState('');

    const [modelReady, setModelReady] = useState(false);
    const [cameraReady, setCameraReady] = useState(false);
    const [loadingModel, setLoadingModel] = useState(true);

    const [captureBusy, setCaptureBusy] = useState(false);
    const [enrollBusy, setEnrollBusy] = useState(false);
    const [punchBusy, setPunchBusy] = useState(false);

    const [samples, setSamples] = useState([]);
    const [toast, setToast] = useState(null);
    const [lastPunchResult, setLastPunchResult] = useState(null);

    const selectedIntern = useMemo(
        () => interns.find((intern) => intern._id === selectedInternId) || null,
        [interns, selectedInternId]
    );

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        const fetchInterns = async () => {
            try {
                const { data } = await API.get('/interns');
                setInterns(data || []);
                if (data?.length > 0) {
                    setSelectedInternId((prev) => prev || data[0]._id);
                }
            } catch {
                showToast('Failed to load interns', 'error');
            }
        };

        fetchInterns();
    }, []);

    useEffect(() => {
        let isMounted = true;

        const loadModel = async () => {
            setLoadingModel(true);
            try {
                await getFaceDetector();
                if (isMounted) setModelReady(true);
            } catch {
                if (isMounted) showToast('Failed to load face model', 'error');
            } finally {
                if (isMounted) setLoadingModel(false);
            }
        };

        loadModel();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        let mediaStream;

        const startCamera = async () => {
            try {
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'user',
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                    },
                    audio: false,
                });

                if (videoRef.current) {
                    videoRef.current.srcObject = mediaStream;
                    videoRef.current.onloadedmetadata = () => {
                        setCameraReady(true);
                    };
                }
            } catch {
                showToast('Camera access denied or unavailable', 'error');
            }
        };

        startCamera();

        return () => {
            if (mediaStream) {
                mediaStream.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    const captureEmbedding = async () => {
        if (!modelReady) throw new Error('Face model is still loading');
        if (!cameraReady || !videoRef.current) throw new Error('Camera is not ready');

        const detector = await getFaceDetector();
        const faces = await detector.estimateFaces(videoRef.current, { flipHorizontal: true });

        if (!faces || faces.length === 0) {
            throw new Error('No face detected. Center your face and try again');
        }

        if (faces.length > 1) {
            throw new Error('Multiple faces detected. Only one face should be visible');
        }

        return buildEmbeddingFromFace(faces[0]);
    };

    const handleCaptureSample = async () => {
        setCaptureBusy(true);
        try {
            const embedding = await captureEmbedding();
            setSamples((prev) => {
                if (prev.length > 0 && prev[0].length !== embedding.length) {
                    throw new Error('Captured sample dimension mismatch. Please clear and capture again');
                }
                const next = [...prev, embedding];
                return next.slice(-MAX_ENROLL_SAMPLES);
            });
            showToast('Sample captured successfully');
        } catch (error) {
            showToast(error.message || 'Failed to capture sample', 'error');
        } finally {
            setCaptureBusy(false);
        }
    };

    const handleEnrollFace = async () => {
        if (!selectedInternId) {
            showToast('Select an intern first', 'error');
            return;
        }

        if (samples.length < MIN_ENROLL_SAMPLES) {
            showToast(`Capture at least ${MIN_ENROLL_SAMPLES} samples for enrollment`, 'error');
            return;
        }

        const sampleDimension = samples[0]?.length || 0;
        if (!sampleDimension || samples.some((sample) => sample.length !== sampleDimension)) {
            showToast('Sample dimensions are inconsistent. Clear and recapture samples.', 'error');
            return;
        }

        setEnrollBusy(true);
        try {
            const { data } = await API.post(`/attendance/face/enroll/${selectedInternId}`, {
                embeddings: samples,
                replace: true,
                modelVersion: 'mediapipe-facemesh-v1',
            });
            showToast(data.message || 'Face enrolled successfully');
            setSamples([]);
        } catch (error) {
            showToast(error.response?.data?.message || 'Face enrollment failed', 'error');
        } finally {
            setEnrollBusy(false);
        }
    };

    const handleFacePunchIn = async () => {
        setPunchBusy(true);
        try {
            const embedding = await captureEmbedding();
            const { data } = await API.post('/attendance/face/punchin', { embedding });
            setLastPunchResult(data);
            showToast(data.message || 'Attendance marked successfully');
        } catch (error) {
            showToast(error.response?.data?.message || error.message || 'Face punch-in failed', 'error');
        } finally {
            setPunchBusy(false);
        }
    };

    return (
        <div className="page-container">
            <div className="page-header">
                <div>
                    <h1>Face Attendance</h1>
                    <p>Enroll intern face and mark daily attendance with single punch-in</p>
                </div>
            </div>

            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="stat-card blue">
                    <div className="stat-value" style={{ fontSize: '1.2rem' }}>{interns.length}</div>
                    <div className="stat-label">Interns Loaded</div>
                </div>
                <div className="stat-card cyan">
                    <div className="stat-value" style={{ fontSize: '1.2rem' }}>{samples.length}</div>
                    <div className="stat-label">Captured Samples</div>
                </div>
                <div className={`stat-card ${modelReady && cameraReady ? 'green' : 'amber'}`}>
                    <div className="stat-value" style={{ fontSize: '1.2rem' }}>
                        {loadingModel ? 'Loading...' : (modelReady && cameraReady ? 'Ready' : 'Pending')}
                    </div>
                    <div className="stat-label">Camera & Model</div>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div className="form-group" style={{ marginBottom: 0, minWidth: '280px' }}>
                        <label>Intern (for enrollment)</label>
                        <select
                            className="form-control"
                            value={selectedInternId}
                            onChange={(e) => setSelectedInternId(e.target.value)}
                            disabled={interns.length === 0}
                        >
                            {interns.length === 0 ? (
                                <option value="">No interns found</option>
                            ) : (
                                interns.map((intern) => (
                                    <option key={intern._id} value={intern._id}>{intern.name} — {intern.department}</option>
                                ))
                            )}
                        </select>
                    </div>

                    <button className="btn btn-outline" onClick={handleCaptureSample} disabled={captureBusy || !modelReady || !cameraReady}>
                        <Camera size={16} /> {captureBusy ? 'Capturing...' : 'Capture Sample'}
                    </button>

                    <button className="btn btn-outline" onClick={() => setSamples([])} disabled={samples.length === 0 || enrollBusy || captureBusy}>
                        Clear Samples
                    </button>

                    <button className="btn btn-primary" onClick={handleEnrollFace} disabled={enrollBusy || samples.length < MIN_ENROLL_SAMPLES}>
                        <ShieldCheck size={16} /> {enrollBusy ? 'Enrolling...' : `Enroll Face (${samples.length}/${MIN_ENROLL_SAMPLES}+)`}
                    </button>

                    <button className="btn btn-success" onClick={handleFacePunchIn} disabled={punchBusy || !modelReady || !cameraReady}>
                        <ScanFace size={16} /> {punchBusy ? 'Verifying...' : 'Face Punch-In'}
                    </button>
                </div>
            </div>

            <div className="card" style={{ marginBottom: '24px' }}>
                <h3 className="card-heading"><Camera size={16} /> Live Camera</h3>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        style={{
                            width: '100%',
                            maxWidth: '760px',
                            borderRadius: '12px',
                            border: '1px solid var(--border)',
                            background: '#000',
                        }}
                    />
                </div>
                <p style={{ color: 'var(--text-muted)', marginTop: '10px', fontSize: '0.85rem' }}>
                    Keep only one face in frame. For enrollment, capture 3-5 samples with slight head angle changes.
                </p>
            </div>

            {selectedIntern && (
                <div className="card" style={{ marginBottom: '24px' }}>
                    <h3 className="card-heading"><UserRound size={16} /> Selected Intern</h3>
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                        <div><strong>Name:</strong> {selectedIntern.name}</div>
                        <div><strong>Email:</strong> {selectedIntern.email}</div>
                        <div><strong>Department:</strong> {selectedIntern.department}</div>
                    </div>
                </div>
            )}

            {lastPunchResult && (
                <div className="card">
                    <h3 className="card-heading"><ScanFace size={16} /> Last Punch-In Result</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                        <div><strong>Intern:</strong> {lastPunchResult.intern?.name}</div>
                        <div><strong>Status:</strong> {lastPunchResult.attendance?.status}</div>
                        <div><strong>Punctuality:</strong> {lastPunchResult.attendance?.punctualityStatus}</div>
                        <div><strong>Late Minutes:</strong> {lastPunchResult.attendance?.lateMinutes}</div>
                        <div><strong>Worked Minutes:</strong> {lastPunchResult.attendance?.workedMinutes}</div>
                        <div><strong>Shortfall Minutes:</strong> {lastPunchResult.attendance?.shortfallMinutes}</div>
                        <div><strong>Confidence:</strong> {lastPunchResult.attendance?.faceConfidence}</div>
                    </div>
                </div>
            )}

            {toast && (
                <div className="toast-container">
                    <div className={`toast ${toast.type}`}>
                        <span>{toast.type === 'success' ? <CircleCheck size={16} /> : <CircleX size={16} />}</span>
                        {toast.message}
                    </div>
                </div>
            )}
        </div>
    );
}
