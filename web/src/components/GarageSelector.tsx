import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

interface GarageSelectorProps {
  selectedGarageId: string | null;
  onSelectGarage: (garageId: string) => void;
}

export function GarageSelector({
  selectedGarageId,
  onSelectGarage,
}: GarageSelectorProps) {
  const { data: garages, isLoading, error } = useQuery({
    queryKey: ['billingReport'],
    queryFn: () => apiClient.getBillingReport(),
  });

  if (isLoading) {
    return (
      <div className="garage-selector">
        <h2>Select Garage</h2>
        <div className="loading">Loading garages...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="garage-selector">
        <h2>Select Garage</h2>
        <div className="error">Failed to load garages</div>
      </div>
    );
  }

  return (
    <div className="garage-selector">
      <h2>Select Garage</h2>
      <div className="garage-list">
        {garages?.map((garage, index) => (
          <div
            key={index}
            className={`garage-card ${selectedGarageId === String(index) ? 'selected' : ''}`}
            onClick={() => onSelectGarage(String(index))}
            role="button"
            tabIndex={0}
          >
            <h3>{garage.garage}</h3>
            <div className="stats">
              <span>
                👥 {garage.activeSubscriptions} active
              </span>
              <span>
                💰 ${garage.monthlyRevenue.toLocaleString()}/mo
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

