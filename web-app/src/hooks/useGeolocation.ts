import { useState, useEffect, useCallback } from 'react';

export interface LocationState {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  error: string | null;
  isMocked: boolean;
}

/**
 * Custom hook to track real device GPS coordinates with a fallback mock injector for demos.
 */
export function useGeolocation() {
  const [state, setState] = useState<LocationState>({
    latitude: null,
    longitude: null,
    accuracy: null,
    error: null,
    isMocked: false,
  });

  const [watchId, setWatchId] = useState<number | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocation is not supported by your browser.' }));
      return;
    }

    // If location is mocked, we pause tracking the actual device GPS
    if (state.isMocked) {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        setWatchId(null);
      }
      return;
    }

    const handleSuccess = (position: GeolocationPosition) => {
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        error: null,
        isMocked: false,
      });
    };

    const handleError = (err: GeolocationPositionError) => {
      // On error, fall back to standard coordinates (SF) but log error
      setState((prev) => ({
        ...prev,
        error: `GPS Error: ${err.message}`,
        latitude: prev.latitude ?? 37.7749,
        longitude: prev.longitude ?? -122.4194,
      }));
    };

    const id = navigator.geolocation.watchPosition(handleSuccess, handleError, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 10000,
    });

    setWatchId(id);

    return () => {
      navigator.geolocation.clearWatch(id);
    };
  }, [state.isMocked]);

  const injectMockLocation = useCallback((lat: number, lng: number) => {
    setState({
      latitude: lat,
      longitude: lng,
      accuracy: 5,
      error: null,
      isMocked: true,
    });
  }, []);

  const resetToRealLocation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isMocked: false,
    }));
  }, []);

  return {
    ...state,
    injectMockLocation,
    resetToRealLocation,
  };
}
export type UseGeolocationReturn = ReturnType<typeof useGeolocation>;
