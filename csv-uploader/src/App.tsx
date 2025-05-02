import { useState, useEffect } from "react";

export default function App() {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState([]);

  // WebSocket Connection
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:5050");
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "downloaded") {
        setProgress((prev) => [...prev, data.filename]);
      }
    };
    return () => ws.close();
  }, []);

  const handleUpload = async () => {
    if (!file) return alert("Please select a file!");
    const formData = new FormData();
    formData.append("file", file);

    await fetch("http://localhost:5050/upload", {
      method: "POST",
      body: formData,
    });

    alert("File uploaded! Download in progress...");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center text-gray-700 mb-4">
          Upload CSV File
        </h1>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setFile(e.target.files[0])}
          className="w-full mb-4 p-2 border rounded-md"
        />
        <button
          onClick={handleUpload}
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700"
        >
          Upload & Process the Download Files
        </button>

        {progress.length > 0 && (
          <div className="mt-4">
            <h2 className="text-lg font-bold text-gray-600">
              Download Progress
            </h2>
            <ul className="list-disc pl-5">
              {progress.map((file, index) => (
                <li key={index} className="text-sm text-green-600">
                  {file}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
