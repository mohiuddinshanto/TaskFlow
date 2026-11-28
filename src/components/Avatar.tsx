import React from 'react';

interface AvatarProps {
  name: string;
  avatar?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeClasses = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
};

// Generates consistent background colors based on user name
function getInitialsColor(name: string): string {
  const colors = [
    'bg-blue-600 text-white',
    'bg-emerald-600 text-white',
    'bg-indigo-600 text-white',
    'bg-purple-600 text-white',
    'bg-amber-600 text-white',
    'bg-rose-600 text-white',
    'bg-cyan-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const Avatar: React.FC<AvatarProps> = ({ name, avatar, size = 'sm', className = '' }) => {
  const [imageError, setImageError] = React.useState(false);
  const initials = name
    ? name
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U';

  if (avatar && !imageError) {
    return (
      <img
        src={avatar}
        alt={name}
        referrerPolicy="no-referrer"
        onError={() => setImageError(true)}
        className={`${sizeClasses[size]} rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-800 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClasses[size]} ${getInitialsColor(
        name || ''
      )} rounded-full flex items-center justify-center font-semibold shrink-0 ring-1 ring-white dark:ring-slate-900 ${className}`}
      title={name}
    >
      {initials}
    </div>
  );
};
