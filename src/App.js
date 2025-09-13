import React, { useState, useRef, useEffect } from 'react';
import { Camera, Settings, Plus, Trash2, Edit3, Save, X, Download, Upload, Loader2 } from 'lucide-react';

const MeterReadingApp = () => {
  const [meters, setMeters] = useState([]);
  const [readings, setReadings] = useState([]);
  const [monthlyResetDate, setMonthlyResetDate] = useState(1);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedMeter, setSelectedMeter] = useState('');
  const [capturedImage, setCapturedImage] = useState(null);
  const [manualReading, setManualReading] = useState('');
  const [editingMeter, setEditingMeter] = useState(null);
  const [newMeterName, setNewMeterName] = useState('');
  const [newMeterNumber, setNewMeterNumber] = useState('');
  const [newMeterLastReading, setNewMeterLastReading] = useState('');
  const [showAddMeter, setShowAddMeter] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrError, setOcrError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // OCR.space API configuration
  const OCR_API_KEY = process.env.REACT_APP_OCR_API_KEY || 'helloworld'; // Free API key - replace with your own
  const OCR_API_URL = 'https://api.ocr.space/parse/image';

  // Load data from memory storage on component mount
  useEffect(() => {
    const savedMeters = JSON.parse(localStorage.getItem('meterReadings_meters') || '[]');
    const savedReadings = JSON.parse(localStorage.getItem('meterReadings_readings') || '[]');
    const savedResetDate = parseInt(localStorage.getItem('meterReadings_resetDate') || '1');
    
    setMeters(savedMeters);
    setReadings(savedReadings);
    setMonthlyResetDate(savedResetDate);
  }, []);

  // Save to memory storage whenever data changes
  useEffect(() => {
    localStorage.setItem('meterReadings_meters', JSON.stringify(meters));
  }, [meters]);

  useEffect(() => {
    localStorage.setItem('meterReadings_readings', JSON.stringify(readings));
  }, [readings]);

  useEffect(() => {
    localStorage.setItem('meterReadings_resetDate', monthlyResetDate.toString());
  }, [monthlyResetDate]);

  const getCurrentResetPeriod = () => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const currentDate = now.getDate();
    
    if (currentDate >= monthlyResetDate) {
      return new Date(currentYear, currentMonth, monthlyResetDate);
    } else {
      return new Date(currentYear, currentMonth - 1, monthlyResetDate);
    }
  };

  // Convert image to base64 for Excel storage
  const imageToBase64 = (imageData) => {
    if (!imageData) return '';
    return imageData.split(',')[1] || imageData;
  };

  // Export readings to Excel format (CSV for simplicity on Vercel)
  const exportToExcel = () => {
    if (readings.length === 0) {
      alert("No readings to export.");
      return;
    }
    
    const csvData = [
      ['Meter Number', 'Meter Name', 'Date', 'Time', 'Current Reading', 'Image Blob'],
      ...readings.map(reading => {
        const meter = meters.find(m => m.id === reading.meterId);
        return [
          meter?.number || 'Unknown',
          meter?.name || 'Unknown',
          new Date(reading.date).toISOString().split('T')[0],
          new Date(reading.date).toISOString().split('T')[1].split('.')[0],
          reading.reading,
          imageToBase64(reading.image)
        ];
      })
    ];
    
    const csvContent = csvData.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'meter_readings.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Import readings from CSV
  const importFromExcel = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const lines = text.split('\n').slice(1); // Skip header
        
        const importedReadings = lines.map((line, index) => {
          const [meterNumber, meterName, date, time, currentReading, imageBlob] = 
            line.split(',').map(cell => cell.replace(/"/g, ''));
          
          if (!meterNumber || !currentReading) return null;
          
          let meter = meters.find(m => m.number === meterNumber);
          if (!meter) {
            meter = {
              id: Date.now() + index,
              name: meterName || `Meter ${meterNumber}`,
              number: meterNumber,
              lastMonthReading: 0
            };
            setMeters(prev => [...prev, meter]);
          }
          
          const dateTime = `${date}T${time}`;
          const imageData = imageBlob ? `data:image/jpeg;base64,${imageBlob}` : null;
          
          return {
            id: Date.now() + index + 1000,
            meterId: meter.id,
            reading: parseFloat(currentReading) || 0,
            date: new Date(dateTime).toISOString(),
            image: imageData
          };
        }).filter(Boolean);
        
        setReadings(prev => [...prev, ...importedReadings]);
        alert(`Imported ${importedReadings.length} readings successfully!`);
      } catch (error) {
        alert('Error importing file. Please check the format.');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
      alert('Could not access camera. Please ensure camera permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // OCR.space API implementation
  const extractMeterReading = async (imageData) => {
    if (!imageData) return;

    setIsOcrProcessing(true);
    setOcrError(null);

    try {
      // Convert base64 to blob for form data
      const base64Data = imageData.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('file', blob, 'meter.jpg');
      formData.append('apikey', OCR_API_KEY);
      formData.append('language', 'eng');
      formData.append('isOverlayRequired', 'false');
      formData.append('detectOrientation', 'false');
      formData.append('isTable', 'false');
      formData.append('scale', 'true');
      formData.append('OCREngine', '2');

      const response = await fetch(OCR_API_URL, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`OCR API failed with status: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.IsErroredOnProcessing) {
        throw new Error(result.ErrorMessage || 'OCR processing error');
      }

      const extractedText = result.ParsedResults?.[0]?.ParsedText || '';
      
      // Extract numbers from the OCR result
      const numbers = extractedText.match(/\d+\.?\d*/g);
      if (numbers && numbers.length > 0) {
        // Find the longest number (likely the meter reading)
        const longestNumber = numbers.reduce((a, b) => a.length > b.length ? a : b);
        setManualReading(longestNumber);
      } else {
        throw new Error("No numbers found in the image");
      }

    } catch (error) {
      console.error("OCR Error:", error);
      setOcrError("Failed to read meter. Please enter value manually.");
    } finally {
      setIsOcrProcessing(false);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0);
      
      const imageData = canvas.toDataURL('image/jpeg', 0.8);
      setCapturedImage(imageData);
      stopCamera();
      
      // Trigger OCR after capturing photo
      extractMeterReading(imageData);
    }
  };

  const saveReading = () => {
    if (!selectedMeter || !manualReading) {
      alert('Please select a meter and provide a reading');
      return;
    }

    const newReading = {
      id: Date.now(),
      meterId: selectedMeter,
      reading: parseFloat(manualReading),
      date: new Date().toISOString(),
      image: capturedImage
    };

    setReadings(prev => [...prev, newReading]);
    
    // Reset form
    setCapturedImage(null);
    setManualReading('');
    setSelectedMeter('');
    setOcrError(null);
    
    alert('Reading saved successfully!');
  };

  const addMeter = () => {
    if (!newMeterName.trim() || !newMeterNumber.trim()) {
      alert('Please fill in both meter name and number');
      return;
    }
    
    if (meters.some(m => m.number === newMeterNumber.trim())) {
      alert('A meter with this number already exists');
      return;
    }
    
    const newMeter = {
      id: Date.now(),
      name: newMeterName.trim(),
      number: newMeterNumber.trim(),
      lastMonthReading: parseFloat(newMeterLastReading) || 0
    };
    
    setMeters(prev => [...prev, newMeter]);
    
    if (newMeterLastReading && parseFloat(newMeterLastReading) > 0) {
      const initialReading = {
        id: Date.now() + 1,
        meterId: newMeter.id,
        reading: parseFloat(newMeterLastReading),
        date: getCurrentResetPeriod().toISOString(),
        image: null,
        isInitialReading: true
      };
      setReadings(prev => [...prev, initialReading]);
    }
    
    setNewMeterName('');
    setNewMeterNumber('');
    setNewMeterLastReading('');
    setShowAddMeter(false);
  };

  const deleteMeter = (meterId) => {
    // eslint-disable-next-line no-restricted-globals
    if (confirm('Are you sure you want to delete this meter and all its readings?')) {
      setMeters(prev => prev.filter(m => m.id !== meterId));
      setReadings(prev => prev.filter(r => r.meterId !== meterId));
    }
  };

  const editMeter = (meter) => {
    setEditingMeter(meter.id);
    setNewMeterName(meter.name);
    setNewMeterNumber(meter.number);
    setNewMeterLastReading(meter.lastMonthReading?.toString() || '');
  };

  const saveMeterEdit = (meterId) => {
    if (!newMeterName.trim() || !newMeterNumber.trim()) {
      alert('Please fill in both meter name and number');
      return;
    }
    
    if (meters.some(m => m.number === newMeterNumber.trim() && m.id !== meterId)) {
      alert('A meter with this number already exists');
      return;
    }
    
    setMeters(prev => prev.map(m => 
      m.id === meterId ? { 
        ...m, 
        name: newMeterName,
        number: newMeterNumber,
        lastMonthReading: parseFloat(newMeterLastReading) || m.lastMonthReading || 0
      } : m
    ));
    setEditingMeter(null);
    setNewMeterName('');
    setNewMeterNumber('');
    setNewMeterLastReading('');
  };

  const getConsumptionForMeter = (meterId) => {
    const resetDate = getCurrentResetPeriod();
    const meterReadings = readings
      .filter(r => r.meterId === meterId && new Date(r.date) >= resetDate)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (meterReadings.length < 2) return 0;
    
    const latest = meterReadings[meterReadings.length - 1];
    const earliest = meterReadings[0];
    
    return (latest.reading - earliest.reading).toFixed(2);
  };

  const getLatestReadingForMeter = (meterId) => {
    const meterReadings = readings
      .filter(r => r.meterId === meterId)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    return meterReadings[0] || null;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 font-sans">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-bold">Meter Reader</h1>
            <button 
              onClick={() => setShowSettings(!showSettings)} 
              className="p-2 hover:bg-blue-700 rounded-full"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <p className="text-blue-100 text-sm mt-1">
            Reset Date: {monthlyResetDate}th of each month
          </p>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border-b border-gray-200 p-4 bg-gray-50">
            <h3 className="font-semibold mb-3">Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Monthly Reset Date</label>
                <select 
                  value={monthlyResetDate} 
                  onChange={(e) => setMonthlyResetDate(parseInt(e.target.value))} 
                  className="w-full p-2 border border-gray-300 rounded"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                    <option key={day} value={day}>{day}</option>
                  ))}
                </select>
              </div>
              
              <div className="border-t pt-4">
                <label className="block text-sm font-medium mb-2">OCR API Settings</label>
                <p className="text-xs text-gray-600 mb-2">
                  Using free OCR.space API (demo key). Get your own key at{' '}
                  <a href="https://ocr.space/ocrapi" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    ocr.space
                  </a>
                </p>
              </div>
              
              <div className="border-t pt-4">
                <label className="block text-sm font-medium mb-2">Data Export/Import</label>
                <div className="flex gap-2">
                  <button 
                    onClick={exportToExcel} 
                    className="flex-1 bg-green-600 text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-1 hover:bg-green-700"
                  >
                    <Download className="w-4 h-4" /> Export CSV
                  </button>
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="flex-1 bg-orange-600 text-white py-2 px-3 rounded text-sm flex items-center justify-center gap-1 hover:bg-orange-700"
                  >
                    <Upload className="w-4 h-4" /> Import CSV
                  </button>
                </div>
                <input 
                  ref={fileInputRef} 
                  type="file" 
                  accept=".csv" 
                  onChange={importFromExcel} 
                  className="hidden" 
                />
                <p className="text-xs text-gray-500 mt-1">
                  CSV format: Meter Number, Name, Date, Time, Reading, Image
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Meter Management */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Your Meters</h3>
            <button 
              onClick={() => setShowAddMeter(true)} 
              className="bg-green-600 text-white p-2 rounded-full hover:bg-green-700"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {showAddMeter && (
            <div className="mb-3 p-3 border border-gray-300 rounded bg-white">
              <h4 className="font-medium mb-2">Add New Meter</h4>
              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="Meter name (e.g., Main House)" 
                  value={newMeterName} 
                  onChange={(e) => setNewMeterName(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded" 
                />
                <input 
                  type="text" 
                  placeholder="Meter number (from display)" 
                  value={newMeterNumber} 
                  onChange={(e) => setNewMeterNumber(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded" 
                />
                <input 
                  type="number" 
                  step="0.1" 
                  placeholder="Previous month's reading (optional)" 
                  value={newMeterLastReading} 
                  onChange={(e) => setNewMeterLastReading(e.target.value)} 
                  className="w-full p-2 border border-gray-300 rounded" 
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={addMeter} 
                  className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
                >
                  Add Meter
                </button>
                <button 
                  onClick={() => {
                    setShowAddMeter(false);
                    setNewMeterName('');
                    setNewMeterNumber('');
                    setNewMeterLastReading('');
                  }} 
                  className="bg-gray-400 text-white px-4 py-2 rounded text-sm hover:bg-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {meters.map(meter => (
              <div key={meter.id} className="p-3 border border-gray-200 rounded">
                {editingMeter === meter.id ? (
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      value={newMeterName} 
                      onChange={(e) => setNewMeterName(e.target.value)} 
                      placeholder="Meter name" 
                      className="w-full p-2 border border-gray-300 rounded" 
                    />
                    <input 
                      type="text" 
                      value={newMeterNumber} 
                      onChange={(e) => setNewMeterNumber(e.target.value)} 
                      placeholder="Meter number" 
                      className="w-full p-2 border border-gray-300 rounded" 
                    />
                    <input 
                      type="number" 
                      step="0.1" 
                      value={newMeterLastReading} 
                      onChange={(e) => setNewMeterLastReading(e.target.value)} 
                      placeholder="Previous month reading" 
                      className="w-full p-2 border border-gray-300 rounded" 
                    />
                    <div className="flex gap-2">
                      <button 
                        onClick={() => saveMeterEdit(meter.id)} 
                        className="bg-green-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1 hover:bg-green-700"
                      >
                        <Save className="w-3 h-3" /> Save
                      </button>
                      <button 
                        onClick={() => {
                          setEditingMeter(null);
                          setNewMeterName('');
                          setNewMeterNumber('');
                          setNewMeterLastReading('');
                        }} 
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1 hover:bg-red-700"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-medium">{meter.name}</h4>
                      <p className="text-xs text-gray-500">#{meter.number}</p>
                      <p className="text-sm text-gray-600">
                        Latest: {getLatestReadingForMeter(meter.id)?.reading || 'N/A'} kWh
                      </p>
                      <p className="text-sm text-green-600 font-medium">
                        This month: +{getConsumptionForMeter(meter.id)} kWh
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button 
                        onClick={() => editMeter(meter)} 
                        className="text-blue-600 p-2 hover:bg-blue-50 rounded-full"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteMeter(meter.id)} 
                        className="text-red-600 p-2 hover:bg-red-50 rounded-full"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Camera Section */}
        <div className="p-4">
          <h3 className="font-semibold mb-3">Take Reading</h3>
          
          <div className="mb-3">
            <select 
              value={selectedMeter} 
              onChange={(e) => setSelectedMeter(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded"
            >
              <option value="">Select a meter</option>
              {meters.map(meter => (
                <option key={meter.id} value={meter.id}>
                  {meter.name} (#{meter.number})
                </option>
              ))}
            </select>
          </div>

          {capturedImage ? (
            <div className="mb-4">
              <img src={capturedImage} alt="Captured meter" className="w-full rounded" />
              {isOcrProcessing && (
                <div className="flex items-center justify-center p-3 text-blue-600 bg-blue-50 rounded-b-md">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  <span>Reading meter...</span>
                </div>
              )}
              {ocrError && (
                <div className="text-center p-2 text-red-600 bg-red-50 rounded-b-md">
                  {ocrError}
                </div>
              )}
              <div className="flex gap-2 mt-2">
                <button 
                  onClick={() => {
                    setCapturedImage(null);
                    setManualReading('');
                    setOcrError(null);
                  }} 
                  className="flex-1 bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
                >
                  Retake
                </button>
              </div>
            </div>
          ) : (
            <div>
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full rounded mb-4 bg-gray-200" 
                style={{ display: isCameraActive ? 'block' : 'none' }} 
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
              
              <div className="flex gap-2 mb-4">
                {!isCameraActive ? (
                  <button 
                    onClick={startCamera} 
                    className="flex-1 bg-blue-600 text-white py-2 rounded flex items-center justify-center gap-2 hover:bg-blue-700"
                  >
                    <Camera className="w-4 h-4" /> Start Camera
                  </button>
                ) : (
                  <button 
                    onClick={capturePhoto} 
                    className="flex-1 bg-green-600 text-white py-2 rounded hover:bg-green-700"
                  >
                    Capture & Read
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Meter Reading (kWh)</label>
            <input 
              type="number" 
              step="0.1" 
              placeholder="Reading will appear here or enter manually" 
              value={manualReading} 
              onChange={(e) => setManualReading(e.target.value)} 
              className="w-full p-2 border border-gray-300 rounded" 
            />
          </div>

          <button 
            onClick={saveReading} 
            disabled={!selectedMeter || !manualReading} 
            className="w-full bg-blue-600 text-white py-2 rounded disabled:bg-gray-400 hover:bg-blue-700 disabled:hover:bg-gray-400"
          >
            Save Reading
          </button>
        </div>

        {/* Recent Readings */}
        <div className="p-4 border-t border-gray-200">
          <h3 className="font-semibold mb-3">Recent Readings</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {readings.length > 0 ? readings
              .sort((a, b) => new Date(b.date) - new Date(a.date))
              .slice(0, 10)
              .map(reading => {
                const meter = meters.find(m => parseInt(m.id) === parseInt(reading.meterId));
                return (
                  <div key={reading.id} className="p-2 bg-gray-50 rounded text-sm">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="font-medium">{meter?.name || 'Unknown'}</span>
                        <span className="text-xs text-gray-500 ml-1">#{meter?.number || 'N/A'}</span>
                        {reading.isInitialReading && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-1 rounded ml-1">
                            Initial
                          </span>
                        )}
                      </div>
                      <span className="font-mono">{reading.reading} kWh</span>
                    </div>
                    <div className="text-gray-600 text-xs">
                      {new Date(reading.date).toLocaleString()}
                    </div>
                  </div>
                );
              }) : (
              <p className="text-sm text-gray-500">No recent readings.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeterReadingApp;