import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  subtitle?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon: Icon,
  iconColor = 'text-[#22C55E]',
  subtitle,
  trend,
}) => {
  return (
    <div className="rounded-xl shadow-md hover:shadow-xl transition-all duration-300 p-6 border" style={{ backgroundColor: '#2A4A4A', borderColor: '#3A5A5A' }}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-300 mb-1">{title}</p>
          <h3 className="text-3xl font-bold text-white mb-1">
            {typeof value === 'number' ? value.toFixed(2) : value}
          </h3>
          {subtitle && (
            <p className="text-xs text-gray-400 mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className="flex items-center mt-2">
              <span
                className={`text-xs font-semibold ${
                  trend.isPositive ? 'text-[#86EFAC]' : 'text-red-400'
                }`}
              >
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
            </div>
          )}
        </div>
        <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}>
          <Icon className={`w-6 h-6 ${iconColor}`} style={{ color: '#22C55E' }} />
        </div>
      </div>
    </div>
  );
};

