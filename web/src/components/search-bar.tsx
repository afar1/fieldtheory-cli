interface SearchBarProps {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: () => void;
}

export function SearchBar({ query, onQueryChange, onSubmit }: SearchBarProps) {
  return (
    <form
      className="search-bar"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <input
        aria-label="Search archive"
        className="search-input"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder='Search text, phrase, or author. Example: "Claude Code"'
      />
      <button className="search-button" type="submit">Search</button>
    </form>
  );
}
