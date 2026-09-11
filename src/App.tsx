import { RecetaPropuesta } from "./propuestas/receta/RecetaPropuesta";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app__barra">
        <div className="app__marca">
          <span className="app__punto" aria-hidden="true" />
          <img src="/logo.png" alt="" className="app__logo" />
          <span className="app__wordmark">Agrocode</span>
        </div>
      </header>

      <section className="app__contenido">
        <RecetaPropuesta />
      </section>
    </main>
  );
}

export default App;
