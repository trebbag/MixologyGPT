def build_recipe(template: str, constraints: dict) -> dict:
    include = [name.lower() for name in constraints.get("include_ingredients", [])]
    exclude = [name.lower() for name in constraints.get("exclude_ingredients", [])]

    base_spirit = include[0] if include else "gin"
    ingredients = []

    if template == "sour":
        ingredients = [
            {"name": base_spirit, "quantity": 2.0, "unit": "oz"},
            {"name": "lemon juice", "quantity": 0.75, "unit": "oz"},
            {"name": "simple syrup", "quantity": 0.75, "unit": "oz"},
        ]
        instructions = ["Shake with ice for 10-12s", "Strain into coupe"]
        glassware = "coupe"
        ice_style = "none"
    elif template == "old fashioned":
        ingredients = [
            {"name": base_spirit if base_spirit != "gin" else "whiskey", "quantity": 2.0, "unit": "oz"},
            {"name": "simple syrup", "quantity": 0.25, "unit": "oz"},
            {"name": "bitters", "quantity": 2.0, "unit": "dashes"},
        ]
        instructions = ["Stir with ice for 25-30s", "Strain over large ice"]
        glassware = "rocks"
        ice_style = "large cube"
    elif template == "negroni":
        ingredients = [
            {"name": base_spirit, "quantity": 1.0, "unit": "oz"},
            {"name": "sweet vermouth", "quantity": 1.0, "unit": "oz"},
            {"name": "campari", "quantity": 1.0, "unit": "oz"},
        ]
        instructions = ["Stir with ice for 25-30s", "Strain over ice in rocks glass"]
        glassware = "rocks"
        ice_style = "cubed"
    else:  # collins
        ingredients = [
            {"name": base_spirit, "quantity": 2.0, "unit": "oz"},
            {"name": "lemon juice", "quantity": 0.75, "unit": "oz"},
            {"name": "simple syrup", "quantity": 0.75, "unit": "oz"},
            {"name": "soda water", "quantity": 2.0, "unit": "oz"},
        ]
        instructions = ["Shake with ice for 10-12s", "Top with soda in Collins glass"]
        glassware = "collins"
        ice_style = "cubed"

    filtered = [ing for ing in ingredients if ing["name"].lower() not in exclude]
    return {
        "name": f"{template.title()} Draft",
        "ingredients": filtered,
        "instructions": instructions,
        "glassware": glassware,
        "ice_style": ice_style,
    }
