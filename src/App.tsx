import { DeviceHome } from "./recipe/DeviceHome";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app__bar">
        <div className="app__brand">
          <span className="app__dot" aria-hidden="true" />
          <img src="/logo.png" alt="" className="app__logo" />
          <span className="app__wordmark">Agrocode</span>
        </div>
      </header>

      <section className="app__content">
        <DeviceHome />
      </section>
    </main>
  );
}

export default App;
