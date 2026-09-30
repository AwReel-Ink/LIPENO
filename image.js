const WishImage=name=>{const a=['🎁','🧸','🎧','📚','🧣','🕯️','🎨','🛷','🎮','☕'];return a[[...name].reduce((n,c)=>n+c.charCodeAt(0),0)%a.length]};
