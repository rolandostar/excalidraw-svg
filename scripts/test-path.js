import { pointsOnPath } from 'points-on-path';

const d = "M14.44,10.05V9.56a2.44,2.44,0,1,0-4.88,0v.49a1,1,0,0,0-1,1v3.89a1,1,0,0,0,1,1h4.88a1,1,0,0,0,1-1V11A1,1,0,0,0,14.44,10.05Z";
const subpaths = pointsOnPath(d);
console.log('Points:');
console.log(JSON.stringify(subpaths[0], null, 2));
