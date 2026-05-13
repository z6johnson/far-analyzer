export function Header() {
  return (
    <header className="border-b border-neutral-200 px-8 py-8">
      <div className="mx-auto flex max-w-[90%] items-baseline justify-between">
        <div>
          <h1 className="display-tight text-2xl text-neutral-900">
            FAR Clause Analyzer
          </h1>
          <p className="label-caps mt-2">MSA Review · Beta</p>
        </div>
        <p className="label-caps">UC San Diego</p>
      </div>
    </header>
  );
}
