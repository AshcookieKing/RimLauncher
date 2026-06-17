export default function Background() {
  return (
    <div className="bg-layer">
      <img src="./assets/background.png" alt="" className="bg-image" />
      <div className="bg-blur" />
      <div className="bg-vignette" />
      <div className="holo-pulse" />
    </div>
  );
}
