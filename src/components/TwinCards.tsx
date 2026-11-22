/** Le logo animé : deux photos « jumelles » qui se rejoignent (départ) ou se mélangent (analyse). Décoratif. */
export function TwinCards({ busy = false }: { busy?: boolean }) {
  return (
    <div className={busy ? 'twins busy' : 'twins'} aria-hidden="true">
      <span className="twin a">
        <span className="sun" />
      </span>
      <span className="twin b">
        <span className="sun" />
      </span>
    </div>
  );
}
