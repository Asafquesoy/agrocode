import { DeviceHome } from "./recipe/DeviceHome";
import { CropIcon, DevicesIcon } from "./components/Icons";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app__bar">
        <div className="app__brand">
          <span className="app__logo" aria-hidden="true">
            <CropIcon size={18} />
          </span>
          <span className="app__wordmark">Agrocode</span>
        </div>
        <nav className="app__nav" aria-label="Secciones">
          <span className="app__nav-item" aria-current="page">
            <DevicesIcon size={16} /> Mis dispositivos
          </span>
        </nav>
      </header>

      <section className="app__content">
        <DeviceHome />
      </section>
    </main>
  );
}

export default App;
