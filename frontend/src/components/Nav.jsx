import { Link, useLocation } from "react-router-dom";

const links = [
  { to: "/wrapped", label: "Wrapped" },
  { to: "/library", label: "Library" },
  { to: "/search", label: "Search" },
  { to: "/collab/new", label: "Collab" },
];

export default function Nav() {
  const { pathname } = useLocation();
  return (
    <nav className="flex items-center gap-8 px-8 py-5 border-b border-white/5">
      <Link to="/dashboard" className="text-lg font-bold tracking-tight text-[#1db954]">
        fidolio
      </Link>
      <div className="flex gap-6">
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            className={`text-sm transition-colors ${
              pathname === to ? "text-white" : "text-gray-500 hover:text-gray-200"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
