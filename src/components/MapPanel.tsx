import { divIcon } from 'leaflet'
import { CircleDot } from 'lucide-react'
import { MapContainer, Marker, Popup, TileLayer, useMapEvents } from 'react-leaflet'
import type { Complaint, Severity } from '../types'

const iconFor = (severity: Severity) => divIcon({
  className: 'map-marker-shell',
  html: `<span class="map-marker severity-${severity.toLowerCase()}"><span></span></span>`,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

function MapClickPicker({ onPick }: { onPick: (latitude: number, longitude: number) => void }) {
  useMapEvents({
    click(event) {
      onPick(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

interface MapPanelProps {
  complaints: Complaint[]
  pickMode?: boolean
  pickedPosition?: [number, number] | null
  onPick?: (latitude: number, longitude: number) => void
  onSelect?: (complaint: Complaint) => void
}

export default function MapPanel({
  complaints,
  pickMode = false,
  pickedPosition = null,
  onPick,
  onSelect,
}: MapPanelProps) {
  return (
    <div className={`map-frame ${pickMode ? 'map-frame-pick' : ''}`}>
      {pickMode && (
        <div className="map-pick-hint"><CircleDot size={15} /> Click the map to pin your report</div>
      )}
      <MapContainer
        key={pickMode ? 'map-picker' : 'issue-map'}
        center={[22.7196, 75.8577]}
        zoom={13}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {pickMode && onPick && <MapClickPicker onPick={onPick} />}
        {!pickMode && complaints.map((complaint) => (
          <Marker
            key={complaint.id}
            position={[complaint.latitude, complaint.longitude]}
            icon={iconFor(complaint.severity)}
            eventHandlers={{ click: () => onSelect?.(complaint) }}
          >
            <Popup>
              <div className="map-popup">
                <span className="eyebrow">{complaint.id} · {complaint.category}</span>
                <strong>{complaint.title}</strong>
                <span>{complaint.location}</span>
                <span className={`status-pill status-${complaint.status.toLowerCase().replaceAll(' ', '-')}`}>
                  {complaint.status}
                </span>
                {onSelect && <button type="button" onClick={() => onSelect(complaint)}>View report</button>}
              </div>
            </Popup>
          </Marker>
        ))}
        {pickMode && pickedPosition && (
          <Marker position={pickedPosition} icon={iconFor('High')} />
        )}
      </MapContainer>
    </div>
  )
}
