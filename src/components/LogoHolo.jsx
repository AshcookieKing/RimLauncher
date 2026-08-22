export default function LogoHolo({ size = 'md', className = '' }) {
  const sizeClass = size === 'lg' ? 'logo-holo--lg' : size === 'sm' ? 'logo-holo--sm' : 'logo-holo--md';
  return (
    <div className={`logo-holo ${sizeClass} ${className}`.trim()} aria-hidden={false}>
      <div className="logo-holo__glow" />
      <div className="logo-holo__ring" />
      <img src="./assets/logo.png" alt="StarFront" className="logo-holo__img" />
      <div className="logo-holo__scan" />
      <div className="logo-holo__flicker" />
    </div>
  );
}
