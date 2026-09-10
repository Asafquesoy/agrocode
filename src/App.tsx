import { RecetaPropuesta } from "./propuestas/receta/RecetaPropuesta";
import "./App.css";

function App() {
  return (
    <main className="app">
      <header className="app__cabecera">
        <div className="app__marca">
          <img src="/logo.png" alt="" className="app__logo" />
          <span className="app__wordmark">Agrocode</span>
        </div>
        <p>Compilador de agricultura inteligente · El Mante</p>
      </header>

      <section className="app__contenido">
        <RecetaPropuesta />
      </section>
    </main>
  );
}

export default App;
