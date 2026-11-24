import { Camera, Canvas, director, Director, EffectAsset, Material, Node, RenderTexture, Sprite, SpriteFrame, UITransform, Vec4, view } from 'cc';
import type { AssetService } from '../../../services/asset/AssetService';
import { COZY_BUNDLE } from './CozySudokuTheme';
import { destroyTree, node } from './CozySudokuView';

const FROST_LAYER = 1 << 20;
/** Capture the frozen board once; all GPU assets have the scene's AssetService owner. */
export class CozySudokuFrost {
    private readonly layers: { node: Node; layer: number }[] = [];
    private readonly cameraNode: Node;
    private readonly camera: Camera;
    private readonly projection: Node;
    private readonly target: RenderTexture;
    private readonly frame: SpriteFrame;
    private readonly material: Material;
    private disposed = false;
    constructor(parent:Node,roots:readonly Node[],private readonly assets:AssetService,effect:EffectAsset) {
        let source:Camera|undefined;
        for(let p:Node|null=parent;p;p=p.parent){source=p.getComponent(Canvas)?.cameraComponent??source;if(source)break;}
        if(!source)throw new Error('Cozy Sudoku UI camera is missing');
        const size=view.getVisibleSize();
        this.target=assets.trackRuntimeAsset(COZY_BUNDLE,new RenderTexture());
        this.target.reset({width:Math.ceil(size.width/2),height:Math.ceil(size.height/2)});
        this.frame=assets.createSpriteFrame(COZY_BUNDLE,this.target);this.frame.packable=false;
        this.material=assets.trackRuntimeAsset(COZY_BUNDLE,new Material());
        this.material.initialize({effectAsset:effect,defines:{USE_TEXTURE:true}});
        this.material.setProperty('frostStep',new Vec4(1.5/this.target.width,1.5/this.target.height,0,0));
        this.cameraNode=new Node('FrostCamera');parent.addChild(this.cameraNode);
        this.cameraNode.setWorldPosition(source.node.worldPosition);
        this.cameraNode.setWorldRotation(source.node.worldRotation);
        this.camera=this.cameraNode.addComponent(Camera);
        this.camera.projection=Camera.ProjectionType.ORTHO;this.camera.orthoHeight=source.orthoHeight;
        this.camera.near=source.near;this.camera.far=source.far;
        this.camera.clearFlags=Camera.ClearFlag.SOLID_COLOR;this.camera.clearColor=source.clearColor.clone();
        this.camera.priority=source.priority-1;this.camera.visibility=FROST_LAYER;this.camera.targetTexture=this.target;
        for(const root of roots){
            const all=[root];for(let i=0;i<all.length;i++)all.push(...all[i].children);
            for(const n of all){this.layers.push({node:n,layer:n.layer});n.layer=FROST_LAYER;}
        }
        this.projection=node('FrostedGameplay',parent,0,0,size.width,size.height);
        // Keep the captured board behind SafeRoot's live dialog nodes.
        this.projection.setSiblingIndex(1);
        const sprite=this.projection.addComponent(Sprite);sprite.spriteFrame=this.frame;sprite.sizeMode=Sprite.SizeMode.CUSTOM;
        sprite.customMaterial=this.material;this.projection.getComponent(UITransform)!.setContentSize(size.width,size.height);
        director.once(Director.EVENT_AFTER_DRAW,this.freeze,this);
    }
    private freeze():void {if(!this.disposed)this.camera.enabled=false;}
    dispose():void {
        if(this.disposed)return;this.disposed=true;
        director.off(Director.EVENT_AFTER_DRAW,this.freeze,this);
        this.camera.targetTexture=null;
        for(const item of this.layers)if(item.node.isValid)item.node.layer=item.layer;
        this.layers.length=0;
        destroyTree(this.cameraNode);destroyTree(this.projection);
        this.assets.releaseRuntimeAsset(this.material);this.assets.releaseRuntimeAsset(this.frame);this.assets.releaseRuntimeAsset(this.target);
    }
}
