export default function Home() {
  return (
    <main>
      <section className="card">
        <h1>ShopX Product Extractor</h1>
        <p>
          POST a product URL to <code>/api/extract-product</code> to receive a
          normalized <code>ProductExtractResult</code>.
        </p>
      </section>
    </main>
  );
}
