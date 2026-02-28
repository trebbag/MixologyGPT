from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import current_active_admin, current_active_user
from app.db.session import get_db
from app.db.models.ingredient import Ingredient, IngredientEquivalency
from app.db.models.inventory import InventoryItem, InventoryLot, InventoryEvent
from app.db.models.equipment import Equipment, Glassware
from app.db.models.syrup import SyrupRecipe, SyrupLot, ExpiryRule
from app.schemas.ingredient import (
    IngredientCreate,
    IngredientRead,
    IngredientUpdate,
    IngredientEquivalencyCreate,
    IngredientEquivalencyRead,
)
from app.schemas.inventory import (
    InventoryItemCreate,
    InventoryEventCreate,
    InventoryEventRead,
    InventoryItemRead,
    InventoryItemUpdate,
    InventoryLotCreate,
    InventoryLotRead,
    InventoryLotUpdate,
)
from app.schemas.equipment import EquipmentCreate, EquipmentRead, GlasswareCreate, GlasswareRead
from app.schemas.syrup import (
    SyrupRecipeCreate,
    SyrupRecipeRead,
    SyrupLotCreate,
    SyrupLotRead,
    ExpiryRuleCreate,
    ExpiryRuleRead,
    SyrupMakerExecuteRequest,
)
from app.schemas.conversion import ConversionPlanRequest, ConversionExecuteRequest
from app.db.models.user import User
from app.core.schema_validation import validate_schema
from app.domain.units import to_ml, from_ml, to_ml_with_custom, from_ml_with_custom
from app.core.paths import resolve_schema_dir
from datetime import datetime, timedelta


router = APIRouter()

SCHEMA_DIR = resolve_schema_dir()


@router.post("/ingredients", response_model=IngredientRead)
async def create_ingredient(
    payload: IngredientCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    ingredient = Ingredient(**payload.model_dump())
    db.add(ingredient)
    await db.commit()
    await db.refresh(ingredient)
    return ingredient


@router.patch("/ingredients/{ingredient_id}", response_model=IngredientRead)
async def update_ingredient(
    ingredient_id: str,
    payload: IngredientUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    ingredient = await db.get(Ingredient, ingredient_id)
    if not ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(ingredient, key, value)
    await db.commit()
    await db.refresh(ingredient)
    return ingredient


@router.get("/ingredients", response_model=List[IngredientRead])
async def list_ingredients(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(Ingredient).order_by(Ingredient.canonical_name))
    return list(result.scalars().all())


@router.get("/ingredients/{ingredient_id}", response_model=IngredientRead)
async def get_ingredient(
    ingredient_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    ingredient = await db.get(Ingredient, ingredient_id)
    if not ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")
    return ingredient


@router.post("/equivalencies", response_model=IngredientEquivalencyRead)
async def create_equivalency(
    payload: IngredientEquivalencyCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(current_active_admin),
):
    equivalency = IngredientEquivalency(**payload.model_dump())
    db.add(equivalency)
    await db.commit()
    await db.refresh(equivalency)
    return equivalency


@router.get("/equivalencies", response_model=List[IngredientEquivalencyRead])
async def list_equivalencies(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(IngredientEquivalency))
    return list(result.scalars().all())


@router.post("/items", response_model=InventoryItemRead)
async def create_inventory_item(
    payload: InventoryItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    item = InventoryItem(user_id=user.id, **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.get("/items", response_model=List[InventoryItemRead])
async def list_inventory_items(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(InventoryItem).where(InventoryItem.user_id == user.id))
    return list(result.scalars().all())


@router.get("/items/{item_id}", response_model=InventoryItemRead)
async def get_inventory_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    item = await db.get(InventoryItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


@router.patch("/items/{item_id}", response_model=InventoryItemRead)
async def update_inventory_item(
    item_id: str,
    payload: InventoryItemUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    item = await db.get(InventoryItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/items/{item_id}")
async def delete_inventory_item(
    item_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    item = await db.get(InventoryItem, item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    await db.delete(item)
    await db.commit()
    return {"status": "ok"}


@router.post("/lots", response_model=InventoryLotRead)
async def create_inventory_lot(
    payload: InventoryLotCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    item = await db.get(InventoryItem, payload.inventory_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    expiry_date = payload.expiry_date
    if not expiry_date:
        ingredient = await db.get(Ingredient, item.ingredient_id)
        rule_result = await db.execute(
            select(ExpiryRule)
            .where(ExpiryRule.ingredient_id == item.ingredient_id)
            .order_by(ExpiryRule.days.desc())
            .limit(1)
        )
        rule = rule_result.scalars().first()
        if not rule and ingredient:
            rule_result = await db.execute(
                select(ExpiryRule)
                .where(ExpiryRule.category == ingredient.category)
                .where(
                    (ExpiryRule.subcategory == ingredient.subcategory)
                    | (ExpiryRule.subcategory.is_(None))
                )
                .order_by(ExpiryRule.days.desc())
                .limit(1)
            )
            rule = rule_result.scalars().first()
        if rule:
            expiry_date = (payload.purchase_date or datetime.utcnow()) + timedelta(days=rule.days)
    lot = InventoryLot(**payload.model_dump(exclude={"expiry_date"}), expiry_date=expiry_date)
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@router.get("/lots", response_model=List[InventoryLotRead])
async def list_inventory_lots(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(
        select(InventoryLot)
        .join(InventoryItem, InventoryLot.inventory_item_id == InventoryItem.id)
        .where(InventoryItem.user_id == user.id)
    )
    return list(result.scalars().all())


@router.get("/lots/{lot_id}", response_model=InventoryLotRead)
async def get_inventory_lot(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    lot = await db.get(InventoryLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    item = await db.get(InventoryItem, lot.inventory_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    return lot


@router.patch("/lots/{lot_id}", response_model=InventoryLotRead)
async def update_inventory_lot(
    lot_id: str,
    payload: InventoryLotUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    lot = await db.get(InventoryLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    item = await db.get(InventoryItem, lot.inventory_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(lot, key, value)
    await db.commit()
    await db.refresh(lot)
    return lot


@router.post("/lots/{lot_id}/normalize", response_model=InventoryLotRead)
async def normalize_inventory_lot(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    lot = await db.get(InventoryLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    item = await db.get(InventoryItem, lot.inventory_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    if not item.preferred_unit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Preferred unit not set")
    ml = to_ml_with_custom(lot.quantity, lot.unit, item.unit_to_ml)
    normalized = from_ml_with_custom(ml, item.preferred_unit, item.unit_to_ml)
    lot.quantity = normalized
    lot.unit = item.preferred_unit
    await db.commit()
    await db.refresh(lot)
    return lot


@router.delete("/lots/{lot_id}")
async def delete_inventory_lot(
    lot_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    lot = await db.get(InventoryLot, lot_id)
    if not lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    item = await db.get(InventoryItem, lot.inventory_item_id)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
    await db.delete(lot)
    await db.commit()
    return {"status": "ok"}


@router.post("/events", response_model=InventoryEventRead)
async def create_inventory_event(
    payload: InventoryEventCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    allowed_event_types = {"restock", "consume", "adjust", "waste"}
    if payload.event_type not in allowed_event_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported event_type. Use restock, consume, adjust, or waste.",
        )

    if not payload.lot_id and not payload.inventory_item_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="lot_id or inventory_item_id is required",
        )

    lot = None
    item = None
    if payload.lot_id:
        lot = await db.get(InventoryLot, payload.lot_id)
        if not lot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
        item = await db.get(InventoryItem, lot.inventory_item_id)
        if not item or item.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
        if payload.inventory_item_id and str(payload.inventory_item_id) != str(item.id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="lot_id does not match inventory_item_id",
            )
    else:
        item = await db.get(InventoryItem, payload.inventory_item_id)
        if not item or item.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    if payload.event_type in {"restock", "consume", "waste"} and payload.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity must be > 0")
    if payload.event_type == "adjust" and payload.quantity == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity must be non-zero for adjust")

    if payload.event_type == "restock":
        signed_quantity = abs(payload.quantity)
    elif payload.event_type in {"consume", "waste"}:
        signed_quantity = -abs(payload.quantity)
    else:
        signed_quantity = payload.quantity

    if lot:
        try:
            delta_ml = to_ml_with_custom(signed_quantity, payload.unit, item.unit_to_ml)
            delta_in_lot_unit = from_ml_with_custom(delta_ml, lot.unit, item.unit_to_ml)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
        if lot.quantity + delta_in_lot_unit < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough quantity in lot")
        lot.quantity = lot.quantity + delta_in_lot_unit
    else:
        if payload.event_type != "restock":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="lot_id is required for consume, adjust, and waste events",
            )
        db.add(
            InventoryLot(
                inventory_item_id=item.id,
                quantity=abs(payload.quantity),
                unit=payload.unit,
                purchase_date=payload.event_time or datetime.utcnow(),
            )
        )

    event = InventoryEvent(
        inventory_item_id=item.id,
        event_type=payload.event_type,
        delta_quantity=signed_quantity,
        unit=payload.unit,
        note=payload.note,
        event_time=payload.event_time or datetime.utcnow(),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/events", response_model=List[InventoryEventRead])
async def list_inventory_events(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
    inventory_item_id: Optional[str] = None,
    lot_id: Optional[str] = None,
    limit: int = 100,
):
    query = (
        select(InventoryEvent)
        .join(InventoryItem, InventoryEvent.inventory_item_id == InventoryItem.id)
        .where(InventoryItem.user_id == user.id)
        .order_by(InventoryEvent.event_time.desc())
        .limit(min(max(limit, 1), 500))
    )
    if inventory_item_id:
        query = query.where(InventoryEvent.inventory_item_id == inventory_item_id)
    if lot_id:
        lot = await db.get(InventoryLot, lot_id)
        if not lot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
        item = await db.get(InventoryItem, lot.inventory_item_id)
        if not item or item.user_id != user.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory lot not found")
        query = query.where(InventoryEvent.inventory_item_id == lot.inventory_item_id)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.post("/equipment", response_model=EquipmentRead)
async def create_equipment(
    payload: EquipmentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    equipment = Equipment(user_id=user.id, **payload.model_dump())
    db.add(equipment)
    await db.commit()
    await db.refresh(equipment)
    return equipment


@router.get("/equipment", response_model=List[EquipmentRead])
async def list_equipment(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Equipment).where(Equipment.user_id == user.id))
    return list(result.scalars().all())


@router.post("/glassware", response_model=GlasswareRead)
async def create_glassware(
    payload: GlasswareCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    glassware = Glassware(user_id=user.id, **payload.model_dump())
    db.add(glassware)
    await db.commit()
    await db.refresh(glassware)
    return glassware


@router.get("/glassware", response_model=List[GlasswareRead])
async def list_glassware(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    result = await db.execute(select(Glassware).where(Glassware.user_id == user.id))
    return list(result.scalars().all())


@router.post("/syrup-recipes", response_model=SyrupRecipeRead)
async def create_syrup_recipe(
    payload: SyrupRecipeCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    syrup_recipe = SyrupRecipe(**payload.model_dump())
    db.add(syrup_recipe)
    await db.commit()
    await db.refresh(syrup_recipe)
    return syrup_recipe


@router.get("/syrup-recipes", response_model=List[SyrupRecipeRead])
async def list_syrup_recipes(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(SyrupRecipe))
    return list(result.scalars().all())


@router.post("/syrup-lots", response_model=SyrupLotRead)
async def create_syrup_lot(
    payload: SyrupLotCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    lot = SyrupLot(**payload.model_dump())
    db.add(lot)
    await db.commit()
    await db.refresh(lot)
    return lot


@router.get("/syrup-lots", response_model=List[SyrupLotRead])
async def list_syrup_lots(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(SyrupLot))
    return list(result.scalars().all())


@router.post("/expiry-rules", response_model=ExpiryRuleRead)
async def create_expiry_rule(
    payload: ExpiryRuleCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    if not payload.ingredient_id and not payload.category:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="ingredient_id or category required")
    rule = ExpiryRule(**payload.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.get("/expiry-rules", response_model=List[ExpiryRuleRead])
async def list_expiry_rules(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(current_active_user),
):
    result = await db.execute(select(ExpiryRule))
    return list(result.scalars().all())


@router.post("/conversion-plans")
async def create_conversion_plan(
    payload: ConversionPlanRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    input_ingredient = await db.get(Ingredient, payload.input_ingredient_id)
    output_ingredient = await db.get(Ingredient, payload.output_ingredient_id)
    if not input_ingredient or not output_ingredient:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ingredient not found")

    try:
        input_ml = to_ml(payload.input_quantity, payload.input_unit)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    output_ml: float
    if payload.output_quantity is not None:
        try:
            output_ml = to_ml(payload.output_quantity, payload.output_unit)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    else:
        if payload.ratio in ("1:1", "2:1"):
            sugar = input_ml
            water_ratio = 1.0 if payload.ratio == "1:1" else 0.5
            output_ml = sugar + (sugar * water_ratio)
        else:
            output_ml = input_ml

    try:
        output_quantity = from_ml(output_ml, payload.output_unit)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    plan = {
        "input": {
            "ingredient": input_ingredient.canonical_name,
            "quantity": payload.input_quantity,
            "unit": payload.input_unit,
        },
        "output": {
            "ingredient": output_ingredient.canonical_name,
            "quantity": output_quantity,
            "unit": payload.output_unit,
        },
        "steps": [
            {"instruction": "Combine input ingredient with required base liquid."},
            {"instruction": "Heat gently until dissolved, then cool."},
        ],
    }

    schema_path = SCHEMA_DIR / "conversion_plan.json"
    try:
        validate_schema(schema_path, plan)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return plan


@router.post("/conversion-execute")
async def execute_conversion(
    payload: ConversionExecuteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    input_lot = await db.get(InventoryLot, payload.input_lot_id)
    if not input_lot:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Input lot not found")
    input_item = await db.get(InventoryItem, input_lot.inventory_item_id)
    if not input_item or input_item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Input lot not found")

    output_item = await db.get(InventoryItem, payload.output_inventory_item_id)
    if not output_item or output_item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Output item not found")

    try:
        input_ml = to_ml_with_custom(payload.input_quantity, payload.input_unit, input_item.unit_to_ml)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if payload.output_quantity is not None:
        try:
            output_ml = to_ml_with_custom(payload.output_quantity, payload.output_unit, output_item.unit_to_ml)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    else:
        if payload.ratio in ("1:1", "2:1"):
            water_ratio = 1.0 if payload.ratio == "1:1" else 0.5
            output_ml = input_ml + (input_ml * water_ratio)
        else:
            output_ml = input_ml

    if payload.input_quantity <= 0 or input_lot.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Input lot empty")

    try:
        consumed_in_lot_unit = from_ml_with_custom(input_ml, input_lot.unit, input_item.unit_to_ml)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if consumed_in_lot_unit > input_lot.quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough quantity")
    input_lot.quantity = max(0.0, input_lot.quantity - consumed_in_lot_unit)
    try:
        output_quantity = from_ml_with_custom(output_ml, payload.output_unit, output_item.unit_to_ml)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    new_lot = InventoryLot(
        inventory_item_id=output_item.id,
        quantity=output_quantity,
        unit=payload.output_unit,
        purchase_date=datetime.utcnow(),
    )
    db.add(new_lot)
    db.add(
        InventoryEvent(
            inventory_item_id=input_item.id,
            event_type="conversion_input",
            delta_quantity=-consumed_in_lot_unit,
            unit=input_lot.unit,
            note=f"Converted to {output_quantity} {payload.output_unit}",
        )
    )
    db.add(
        InventoryEvent(
            inventory_item_id=output_item.id,
            event_type="conversion_output",
            delta_quantity=output_quantity,
            unit=payload.output_unit,
            note=f"Created from lot {input_lot.id}",
        )
    )
    await db.commit()
    await db.refresh(new_lot)
    return {"status": "ok", "output_lot_id": str(new_lot.id)}


@router.post("/syrup-maker/execute")
async def make_syrup(
    payload: SyrupMakerExecuteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    syrup_recipe = await db.get(SyrupRecipe, payload.syrup_recipe_id)
    if not syrup_recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syrup recipe not found")
    inventory_item = await db.get(InventoryItem, payload.inventory_item_id)
    if not inventory_item or inventory_item.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")

    expiry_rule = await db.execute(
        select(ExpiryRule).where(ExpiryRule.ingredient_id == inventory_item.ingredient_id)
    )
    expiry_rule = expiry_rule.scalars().first()
    expiry_date = None
    if expiry_rule:
        expiry_date = (payload.made_at or datetime.utcnow()) + timedelta(days=expiry_rule.days)

    syrup_lot = SyrupLot(
        syrup_recipe_id=payload.syrup_recipe_id,
        inventory_item_id=payload.inventory_item_id,
        made_at=payload.made_at,
        expiry_date=expiry_date,
        quantity=payload.quantity,
        unit=payload.unit,
    )
    db.add(syrup_lot)
    output_lot = InventoryLot(
        inventory_item_id=payload.inventory_item_id,
        quantity=payload.quantity,
        unit=payload.unit,
        purchase_date=payload.made_at or datetime.utcnow(),
        expiry_date=expiry_date,
    )
    db.add(output_lot)
    if payload.inputs:
        for input_row in payload.inputs:
            input_lot = await db.get(InventoryLot, input_row.lot_id)
            if not input_lot:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Input lot not found")
            input_item = await db.get(InventoryItem, input_lot.inventory_item_id)
            if not input_item or input_item.user_id != user.id:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Input lot not found")
            input_ml = to_ml_with_custom(input_row.quantity, input_row.unit, input_item.unit_to_ml)
            consumed = from_ml_with_custom(input_ml, input_lot.unit, input_item.unit_to_ml)
            if consumed > input_lot.quantity:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough quantity")
            input_lot.quantity = max(0.0, input_lot.quantity - consumed)
            db.add(
                InventoryEvent(
                    inventory_item_id=input_item.id,
                    event_type="syrup_input",
                    delta_quantity=-consumed,
                    unit=input_lot.unit,
                    note=f"Syrup batch {payload.syrup_recipe_id}",
                )
            )
    db.add(
        InventoryEvent(
            inventory_item_id=payload.inventory_item_id,
            event_type="syrup_output",
            delta_quantity=payload.quantity,
            unit=payload.unit,
            note=f"Syrup batch {payload.syrup_recipe_id}",
        )
    )
    await db.commit()
    await db.refresh(syrup_lot)
    return syrup_lot


@router.get("/insights")
async def inventory_insights(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(current_active_user),
):
    from app.core.config import settings

    now = datetime.utcnow()
    expiry_cutoff = now + timedelta(days=settings.expiry_window_days)
    expiring = await db.execute(
        select(InventoryLot)
        .join(InventoryItem, InventoryLot.inventory_item_id == InventoryItem.id)
        .where(InventoryItem.user_id == user.id)
        .where(InventoryLot.expiry_date != None)  # noqa: E711
        .where(InventoryLot.expiry_date <= expiry_cutoff)
    )
    expiring_lots = list(expiring.scalars().all())
    low_stock = await db.execute(
        select(InventoryItem)
        .where(InventoryItem.user_id == user.id)
    )
    low_stock_items = []
    for item in low_stock.scalars().all():
        lots = await db.execute(select(InventoryLot).where(InventoryLot.inventory_item_id == item.id))
        total = sum(lot.quantity for lot in lots.scalars().all())
        if total <= settings.low_stock_threshold:
            low_stock_items.append({"item_id": str(item.id), "total": total, "unit": item.unit})
    return {
        "expiry_soon": [
            {
                "lot_id": str(lot.id),
                "item_id": str(lot.inventory_item_id),
                "quantity": lot.quantity,
                "unit": lot.unit,
                "expiry_date": lot.expiry_date,
            }
            for lot in expiring_lots
        ],
        "low_stock": low_stock_items,
    }
