import json
import re

# Mana symbol to color mapping
MANA_SYMBOLS = {
    '{W}': 'White',
    '{U}': 'Blue',
    '{B}': 'Black',
    '{R}': 'Red',
    '{G}': 'Green',
}

# Land type to color mapping (for fetchlands that search for basic land types)
LAND_TYPES = {
    'Plains': 'White',
    'Island': 'Blue',
    'Swamp': 'Black',
    'Mountain': 'Red',
    'Forest': 'Green',
}

def get_mana_colors(card):
    """Determine what colors of mana a land produces based on its card text."""
    text = card.get('cardText', '')
    name = card.get('cardName', '')
    colors = set()
    
    # Find all "Add ..." clauses and extract mana symbols from each
    # This handles: "Add {B}", "Add {W} or {B}", "Add {R}, {W}, or {B}", "Add {B}{B}"
    add_clauses = re.findall(r'[Aa]dd\s+([^.;]*?)(?:\.|;|$|\))', text)
    for clause in add_clauses:
        for symbol, color in MANA_SYMBOLS.items():
            if symbol in clause:
                colors.add(color)
    
    # Check for fetchlands that search for basic land type cards
    # e.g., "Search your library for a Plains or Swamp card"
    # e.g., "Search your library for a Swamp or Mountain card"  
    fetch_pattern = re.findall(r'[Ss]earch your library for a (\w+)(?: or (\w+))? card', text)
    for match in fetch_pattern:
        for land_name in match:
            if land_name in LAND_TYPES:
                colors.add(LAND_TYPES[land_name])
    
    # Check for "mana of any color" patterns
    if re.search(r'mana of any color', text, re.IGNORECASE):
        colors.update(['White', 'Blue', 'Black', 'Red', 'Green'])
    
    # Check for "choose a color" patterns (like Three Tree City)
    if re.search(r'[Cc]hoose a color.*[Aa]dd.*mana of that color', text):
        colors.update(['White', 'Blue', 'Black', 'Red', 'Green'])
    
    # Urborg, Tomb of Yawgmoth - makes all lands Swamps (produces {B})
    if 'Each land is a Swamp' in text:
        colors.add('Black')
    
    # Check for hybrid mana symbols like {W/B}
    hybrid_patterns = re.findall(r'{([WUBRG])/([WUBRG])}', text)
    for h1, h2 in hybrid_patterns:
        for symbol, color in MANA_SYMBOLS.items():
            if '{' + h1 + '}' == symbol:
                colors.add(color)
            if '{' + h2 + '}' == symbol:
                colors.add(color)
    
    return sorted(colors)

def main():
    with open('CARDS.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    changes = []
    
    for section in data['sections']:
        for item in section['items']:
            if item.get('types') == 'Land':
                colors = get_mana_colors(item)
                
                if len(colors) == 0:
                    # Colorless-only land (like Thespian's Stage that only adds {C})
                    mana_value = "Colorless"
                elif len(colors) == 1:
                    mana_value = colors[0]
                else:
                    mana_value = colors
                
                item['mana'] = mana_value
                changes.append(f"  {item['cardName']}: mana = {mana_value}")
    
    with open('CARDS.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"Updated {len(changes)} land cards:")
    for c in changes:
        print(c)

if __name__ == '__main__':
    main()
