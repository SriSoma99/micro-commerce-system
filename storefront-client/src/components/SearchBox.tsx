import { useState, type FormEvent } from "react";

interface SearchBoxProps {
  value: string;
  onSearch: (query: string) => void;
}

export function SearchBox({ value, onSearch }: SearchBoxProps) {
  const [text, setText] = useState(value);
  // Follow the address bar: back/forward or a chip removing the keyword changes `value` from outside.
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch(text.trim());
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <label className="sr-only" htmlFor="site-search">
        Search products
      </label>
      <input id="site-search" className="search__input" type="search" placeholder="Search milk, bananas, paper towels…" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <button type="submit" className="search__button" aria-label="Search">
        🔍
      </button>
    </form>
  );
}
