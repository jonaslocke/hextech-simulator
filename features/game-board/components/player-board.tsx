export const PlayerBoard = () => {
  return (
    <>
      <div className="gap-2 grid grid-cols-[130px_minmax(0,1fr)_130px_64px]">
        <div className="bg-white/5 rounded-md">d</div>
        <div className="bg-white/5 rounded-md">r</div>
        <div className="bg-white/5 rounded-md">t</div>
        <div className="bg-white/5 rounded-md">z</div>
      </div>
      <div className="gap-2 grid grid-cols-[130px_130px_minmax(0,1fr)_130px]">
        <div className="bg-white/5 rounded-md">C</div>
        <div className="bg-white/5 rounded-md">L</div>
        <div className="bg-white/5 rounded-md">B</div>
        <div className="bg-white/5 rounded-md">D</div>
      </div>
    </>
  );
};
