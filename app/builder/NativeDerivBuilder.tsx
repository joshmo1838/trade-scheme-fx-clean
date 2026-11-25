export default function NativeDerivBuilder() {
  return (
    <main style={{ position: "fixed", inset: 0, width: "100vw", height: "100dvh", overflow: "hidden", background: "#fff" }}>
      <iframe
        title="Official Deriv DBot workspace"
        src="/native-deriv/index.html#bot_builder"
        sandbox="allow-scripts allow-downloads"
        referrerPolicy="no-referrer"
        style={{ display: "block", width: "100%", height: "100%", border: 0, background: "#fff" }}
      />
    </main>
  );
}
