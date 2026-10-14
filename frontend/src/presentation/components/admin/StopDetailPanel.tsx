import { useState } from "react";

export interface Stop {
    id: string;
    name: string;
    order: number;
    latitude: number;
    longitude: number;
    routeId?: string;
}

interface StopDetailPanelProps {
    stop: Stop;
    onClose: () => void;
    onEdit?: (stop: Stop) => void;
    onDelete?: (stop: Stop) => void;
}

export function StopDetailPanel({ stop, onClose, onEdit, onDelete }: StopDetailPanelProps) {
    const [showCoordinates, setShowCoordinates] = useState(false);


    return (
        <div
            style={{ 
                position: 'fixed', 
                inset: 0, 
                background: 'rgba(0, 0, 0, 0.65)', 
                backdropFilter: 'blur(4px)', display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                zIndex: 1100, 
                padding: 'var(--space-4)', 
            }}
            onClick={(event) => { if (event.target == event.currentTarget) {
                onClose();
                }
            }}
        >
            <div
                style={{ 
                    width: '460px', 
                    maxWidth: '100%', 
                    background: 'var(--color-surface-1)', 
                    border: '1px solid var(--color-border)', 
                    borderRadius: 'var(--radius-xl)', 
                    boxShadow: 'var(--shadow-lg)', 
                    overflow: 'hidden', 
                }}
            >
                {/* Header */}
                <div
                    style={{ 
                        padding: 'var(--space-5)', 
                        borderBottom: '1px solid var(--color-border)', 
                        display: 'flex', 
                        alignItems: 'flex-start', 
                        justifyContent: 'space-between', 
                        gap: 'var(--space-4)', 
                    }}
                >
                    <div>
                        <div
                           style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 'var(--space-2)', 
                                marginBottom: 'var(--space-1)', 
                            }} 
                        >
                            <span
                                style={{ 
                                    width: '32px', 
                                    height: '32px', 
                                    borderRadius: 'var(--radius-md)', 
                                    background: 'hsla(199, 89%, 48%, 0.12)', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    fontSize: '16px', }}
                            >
                                📍
                            </span>

                            <span
                                style={{ 
                                    fontSize: 'var(--font-size-xs)', 
                                    fontWeight: 700, 
                                    color: 'var(--color-primary-500)', 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.06em',
                                }}
                            >
                                Paradero #{stop.order}
                            </span>
                        </div>

                        <h2
                            style={{ 
                                fontSize: 'var(--font-size-xl)', 
                                fontWeight: 800, 
                                color: 'var(--color-text-primary)', 
                                margin: 0, 
                            }}
                        >
                            {stop.name}
                        </h2>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Cerrar"
                        style={{ 
                            width: '34px', 
                            height: '34px', 
                            border: '1px solid var(--color-border)', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'var(--color-surface-2)', 
                            color: 'var(--color-text-secondary)', 
                            cursor: 'pointer', 
                            fontSize: '18px', 
                        }}
                    >
                        X
                    </button>
                </div>

                {/* Información */}
                <div
                    style={{ 
                        padding: 'var(--space-5)', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: 'var(--space-4)', 
                    }}
                >
                    <div
                        style={{ 
                            display: 'grid', 
                            gridTemplateColumns: '1fr 1fr', 
                            gap: 'var(--space-3)', 
                        }}
                    >
                         <InfoItem label="Orden en la ruta" value={`Paradero ${stop.order}`} /> 
                         <InfoItem label="ID" value={stop.id}  />
                    </div>

                    {/* Coordenadas */} 
                    <div 
                        style={{ 
                            border: '1px solid var(--color-border)', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'var(--color-surface-2)', 
                            overflow: 'hidden', 
                        }} 
                    > 
                        <button 
                            type="button" 
                            onClick={() => setShowCoordinates((value) => !value)} 
                            style={{
                                width: '100%', 
                                border: 'none',
                                background: 'transparent',
                                padding: 'var(--space-4)', 
                                color: 'var(--color-text-primary)', 
                                cursor: 'pointer', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'space-between', 
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: 700, 
                            }} 
                        > 
                            <span>Ubicación geográfica</span> 
                            <span>{showCoordinates ? '▲' : '▼'}</span> 
                        </button> 

                        {showCoordinates && ( 
                            <div 
                                style={{ 
                                    borderTop: '1px solid var(--color-border)', 
                                    padding: 'var(--space-4)', 
                                    display: 'grid', 
                                    gridTemplateColumns: '1fr 1fr', 
                                    gap: 'var(--space-3)', 
                                }} 
                            > 
                                <InfoItem label="Latitud" value={stop.latitude.toFixed(6)} /> 
                                <InfoItem label="Longitud" value={stop.longitude.toFixed(6)} /> 
                            </div> 
                        )} 
                    </div>

                    {/* Vista rápida de coordenadas */}
                    <div
                        style={{ 
                            padding: 'var(--space-4)', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'hsla(199, 89%, 48%, 0.08)', 
                            border: '1px solid hsla(199, 89%, 48%, 0.18)', 
                        }}
                    >
                        <div 
                            style={{ 
                                fontSize: 'var(--font-size-xs)', 
                                color: 'var(--color-text-muted)', 
                                marginBottom: 'var(--space-1)', 
                            }} 
                        > 
                            Coordenadas 
                        </div>

                        <div
                            style={{ 
                                fontSize: 'var(--font-size-sm)', 
                                fontWeight: 700, 
                                color: 'var(--color-text-primary)', 
                                fontFamily: 'monospace', 
                            }}
                        >
                            {stop.latitude.toFixed(6)}, {stop.longitude.toFixed(6)}
                        </div>
                    </div>
                </div>
                
                {/* Acciones */}
                <div
                    style={{ 
                        padding: 'var(--space-5)', 
                        borderTop: '1px solid var(--color-border)', 
                        display: 'flex', 
                        gap: 'var(--space-3)', 
                    }}
                >
                    <button 
                        type="button" 
                        onClick={onClose} 
                        style={{ 
                            flex: 1, 
                            padding: 'var(--space-3)', 
                            background: 'var(--color-surface-2)', 
                            border: '1px solid var(--color-border)', 
                            borderRadius: 'var(--radius-md)', 
                            color: 'var(--color-text-secondary)', 
                            fontSize: 'var(--font-size-sm)', 
                            cursor: 'pointer', 
                        }} 
                    > 
                        Cerrar 
                    </button>

                    {onEdit && ( 
                        <button 
                            type="button" 
                            onClick={() => onEdit(stop)} 
                            style={{ 
                                flex: 1,
                                padding: 'var(--space-3)', 
                                background: 'linear-gradient(135deg, var(--color-primary-500), hsl(199,89%,48%))', 
                                border: 'none', 
                                borderRadius: 'var(--radius-md)', 
                                color: 'white', 
                                fontSize: 'var(--font-size-sm)', 
                                fontWeight: 700, 
                                cursor: 'pointer', 
                            }} 
                        >  
                            Editar 
                        </button> 
                    )}

                    {onDelete && ( 
                        <button 
                            type="button" 
                            onClick={() => onDelete(stop)} 
                            style={{ 
                                flex: 1, 
                                padding: 'var(--space-3)', 
                                background: 'hsl(0, 84%, 60%)', 
                                border: 'none', 
                                borderRadius: 'var(--radius-md)', 
                                color: 'white', 
                                fontSize: 'var(--font-size-sm)', 
                                fontWeight: 700, 
                                cursor: 'pointer', 
                            }} 
                        >  
                            Eliminar 
                        </button> 
                    )}
                </div>
            </div>   
        </div>
    );
}

interface InfoItemProps { 
    label: string; 
    value: string; 
    icon?: string; 
}

function InfoItem({ label, value, icon }: InfoItemProps) {
    return (
        <div
           style={{ 
                padding: 'var(--space-3)', 
                background: 'var(--color-surface-2)', 
                border: '1px solid var(--color-border)', 
                borderRadius: 'var(--radius-md)', 
            }} 
        >
            <div
               style={{ 
                    fontSize: 'var(--font-size-xs)', 
                    color: 'var(--color-text-muted)', 
                    marginBottom: 'var(--space-1)', 
                }} 
            >
                {icon && `${icon} `} 
                {label}
            </div>

            <div 
                style={{ 
                    fontSize: 'var(--font-size-sm)', 
                    fontWeight: 600, 
                    color: 'var(--color-text-primary)', 
                    wordBreak: 'break-word', 
                }} 
            > 
                {value} 
            </div>
        </div>
    );
}