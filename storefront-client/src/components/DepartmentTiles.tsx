import type { Department, ProductCategory } from "../types/product";

interface DepartmentTilesProps {
  departments: Department[];
  onSelect: (category: ProductCategory) => void;
}

/** "Shop by category": one big tappable tile per department, tinted with that department's colour. */
export function DepartmentTiles({ departments, onSelect }: DepartmentTilesProps) {
  if (departments.length === 0) return null;
  return (
    <section aria-labelledby="dept-heading">
      <h2 id="dept-heading" className="section-title">
        Shop by category
      </h2>
      <ul className="tiles">
        {departments.map((department) => (
          <li key={department.id}>
            <button type="button" className="tile" style={{ background: `linear-gradient(135deg, ${department.colors[0]}, ${department.colors[1]})` }} onClick={() => onSelect(department.id)}>
              <span className="tile__emoji" aria-hidden="true">
                {department.emoji}
              </span>
              <span className="tile__name">{department.name}</span>
              <span className="tile__count">{department.count} items</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
