# Music Matcher API Documentation

## Overview

This is a complete FastAPI-based REST API for the Music Matcher service, exposing track management and studio/alignment operations through HTTP endpoints.

## Quick Start

### Installation

Install FastAPI and Uvicorn:
```bash
pip install fastapi uvicorn python-multipart
```

### Running the API

```bash
uvicorn app.api.app:app --reload
```

The API will be available at `http://localhost:8000`

Interactive API documentation: `http://localhost:8000/docs`

---

## API Endpoints

### Track Management

#### List All Tracks
```
GET /api/tracks
```
Returns lightweight track information suitable for UI display.

**Response:**
```json
[
  {
    "track_id": "0",
    "display_name": "song.mp3",
    "audio_path": "/path/to/song.mp3"
  }
]
```

#### Get Track Details
```
GET /api/tracks/{track_id}
```
Returns full track record including metadata and annotations.

**Response:**
```json
{
  "track_id": "0",
  "audio_path": "/path/to/song.mp3",
  "meta": {
    "length_seconds": 240.5,
    "bpm": 120.0,
    "signature": [0.6, 0.4, 0.8, 0.3],
    "preference": 1.0,
    "min_speed": 0.98,
    "max_speed": 1.20
  },
  "annotations": [
    {
      "label": "drop",
      "time_seconds": 32.5,
      "strength": 0.95
    }
  ]
}
```

#### Upload Track
```
POST /api/tracks/upload
Content-Type: multipart/form-data
```
Upload an audio file. The system will automatically extract features, detect drop points, and create annotations.

**Request:**
- `file`: Audio file (mp3, wav, etc.)

**Response:** TrackRecord with extracted metadata and annotations

#### Update Track Annotations
```
PUT /api/tracks/{track_id}/annotations
```
Replace all annotations for a track.

**Request Body:**
```json
[
  {
    "label": "drop",
    "time_seconds": 32.5,
    "strength": 0.95
  },
  {
    "label": "drop",
    "time_seconds": 64.2,
    "strength": 0.88
  }
]
```

#### Update Track Metadata
```
PUT /api/tracks/{track_id}/metadata
```
Replace metadata (BPM, signature, speed constraints, etc.) for a track.

**Request Body:**
```json
{
  "length_seconds": 240.5,
  "bpm": 120.0,
  "signature": [0.6, 0.4, 0.8, 0.3],
  "preference": 1.0,
  "min_speed": 0.98,
  "max_speed": 1.20
}
```

#### Delete Track
```
DELETE /api/tracks/{track_id}
```
Remove a track from the library.

---

### Studio Management

#### List Studios
```
GET /api/studios
```
Returns list of all studio session IDs.

**Response:**
```json
["0", "1", "2"]
```

#### Create Studio
```
POST /api/studios
```
Create a new studio session.

**Response:**
```json
"0"
```

#### Get Studio Session
```
GET /api/studios/{studio_id}
```
Load complete studio session with metadata, query, and alignment.

**Response:**
```json
{
  "studio_id": "0",
  "meta": {
    "source": "silent",
    "video_path": null,
    "notes": "Main project"
  },
  "query": {
    "length_seconds": 300.0,
    "signature": [0.6, 0.4, 0.8, 0.3],
    "requested_points": [
      {
        "label": "drop",
        "time_seconds": 32.0,
        "strength": 1.0
      }
    ]
  },
  "alignment": {
    "score": 0.95,
    "tracks": [
      {
        "track_id": "0",
        "start_time_seconds": 0.0,
        "speed": 1.0,
        "placed_points": [
          {
            "label": "drop",
            "time_seconds": 32.0,
            "strength": 0.95
          }
        ]
      }
    ]
  }
}
```

#### Update Studio Session
```
PUT /api/studios/{studio_id}
```
Save updates to studio session metadata.

#### Get Studio Metadata
```
GET /api/studios/{studio_id}/metadata
```
Get studio metadata only.

#### Update Studio Metadata
```
PUT /api/studios/{studio_id}/metadata
```
Update studio metadata (source, video_path, notes).

**Request Body:**
```json
{
  "source": "video",
  "video_path": "/path/to/video.mp4",
  "notes": "Updated notes"
}
```

---

### Query Management

#### Get Studio Query
```
GET /api/studios/{studio_id}/query
```
Get the query specification for a studio session.

#### Create/Save Query
```
POST /api/studios/{studio_id}/query
```
Create a new query for the studio.

**Request Body:**
```json
{
  "length_seconds": 300.0,
  "signature": [0.6, 0.4, 0.8, 0.3],
  "requested_points": [
    {
      "label": "drop",
      "time_seconds": 32.0,
      "strength": 1.0
    },
    {
      "label": "drop",
      "time_seconds": 64.0,
      "strength": 0.8
    }
  ]
}
```

#### Update Query
```
PUT /api/studios/{studio_id}/query
```
Update an existing query specification.

---

### Alignment & Optimization

#### Get Studio Alignment
```
GET /api/studios/{studio_id}/alignment
```
Get the current alignment result for a studio.

#### Run Optimizer
```
POST /api/studios/{studio_id}/run-optimizer
```
Run the optimizer to compute track alignment based on the query.

Requires:
- A query must be set for the studio
- Tracks must exist in the library

**Response:** AlignmentSpec with optimized track placement and scores

---

## Data Models

### AnnotationPoint
```json
{
  "label": "drop",
  "time_seconds": 32.5,
  "strength": 0.95
}
```

### TrackMeta
```json
{
  "length_seconds": 240.5,
  "bpm": 120.0,
  "signature": [0.6, 0.4, 0.8, 0.3],
  "preference": 1.0,
  "min_speed": 0.98,
  "max_speed": 1.20
}
```

### TrackRecord
```json
{
  "track_id": "0",
  "audio_path": "/path/to/song.mp3",
  "meta": { ... },
  "annotations": [ ... ]
}
```

### QuerySpec
```json
{
  "length_seconds": 300.0,
  "signature": [0.6, 0.4, 0.8, 0.3],
  "requested_points": [ ... ]
}
```

### AlignmentTrack
```json
{
  "track_id": "0",
  "start_time_seconds": 0.0,
  "speed": 1.0,
  "placed_points": [ ... ]
}
```

### AlignmentSpec
```json
{
  "score": 0.95,
  "tracks": [ ... ]
}
```

### StudioMeta
```json
{
  "source": "silent",
  "video_path": null,
  "notes": ""
}
```

### StudioSession
```json
{
  "studio_id": "0",
  "meta": { ... },
  "query": null,
  "alignment": null
}
```

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200 OK`: Successful request
- `201 Created`: Resource created
- `400 Bad Request`: Invalid input or operation failed
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses include a detail message:
```json
{
  "detail": "Track not found: track_id"
}
```

---

## Integration Example

```python
import requests

BASE_URL = "http://localhost:8000"

# Create a studio
studio_response = requests.post(f"{BASE_URL}/api/studios")
studio_id = studio_response.json()

# Create a query
query_data = {
    "length_seconds": 300.0,
    "signature": [0.6, 0.4, 0.8, 0.3],
    "requested_points": [
        {
            "label": "drop",
            "time_seconds": 32.0,
            "strength": 1.0
        }
    ]
}
requests.post(f"{BASE_URL}/api/studios/{studio_id}/query", json=query_data)

# Run optimizer
alignment = requests.post(f"{BASE_URL}/api/studios/{studio_id}/run-optimizer")
print(alignment.json())
```

---

## API Structure

- **Serializers** (`app/serializers/`): Pydantic models for request/response validation
  - `annotation.py`: AnnotationPoint serializers
  - `track.py`: Track-related serializers
  - `studio.py`: Studio, query, and alignment serializers

- **Routes** (`app/api/routes/`): API endpoint handlers
  - `track_routes.py`: Track management endpoints
  - `studio_routes.py`: Studio, query, and alignment endpoints

- **Main App** (`app/api/app.py`): FastAPI application factory
